// ============================================
// 📸 Scan & Image Processing Routes
// ============================================

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const Scan = require('../models/Scan');
const Tree = require('../models/Tree');
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { uploadToCloudinary } = require('../config/cloudinary');
const { analyzeTreeImage, analyzeLatexImage, generateAiSuggestionsOnly } = require('../utils/imageAnalysis');

// Debug Middleware for Scans Route
router.use((req, res, next) => {
    console.log(`🔍 [Scans Route] ${req.method} ${req.path}`);
    next();
});

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

const withTimeout = (promise, ms, message) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

// ============================================
// @route   POST /api/scans/upload
// @desc    Upload and analyze tree image
// @access  Private
// ============================================
router.post('/upload', protect, upload.single('image'), async (req, res) => {
  try {
    const { treeId, scanType, scanSubType } = req.body;

    // Validation
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Please upload an image file'
      });
    }

    if (!treeId) {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        error: 'Tree ID is required'
      });
    }

    // Check if tree exists and belongs to user
    const tree = await Tree.findById(treeId);
    if (!tree) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({
        success: false,
        error: 'Tree not found'
      });
    }

    if (tree.owner.toString() !== req.user.id) {
      fs.unlinkSync(req.file.path);
      return res.status(403).json({
        success: false,
        error: 'Not authorized to scan this tree'
      });
    }

    // 1. Analyze local file immediately (Faster & works offline-ish)
    const localFilePath = path.resolve(req.file.path);
    console.log(`🔍 Analyzing local file: ${localFilePath}`);

    const startTime = Date.now();
    let analysisResults;
    
    try {
        if (scanType === 'latex') {
          analysisResults = await analyzeLatexImage(localFilePath);
        } else {
          analysisResults = await analyzeTreeImage(localFilePath, scanSubType);
        }
    } catch (err) {
        console.error("AI Analysis Failed:", err);
        // Clean up and fail
        fs.unlinkSync(req.file.path);
        return res.status(500).json({ success: false, error: 'AI Analysis failed' });
    }
    
    const processingTime = Date.now() - startTime;

    // Check for AI validation errors (e.g. Not a tree)
    if (analysisResults.error) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        error: analysisResults.error,
        details: analysisResults
      });
    }

    // 2. Upload to Cloudinary (for permanent storage)
    // If this fails, we could optionally return the result anyway, but for now strict consistency
    const uploadResult = await withTimeout(
      uploadToCloudinary(req.file, 'rubbersense/scans'),
      20000,
      'Cloudinary upload timed out'
    );

    // 2.5 Upload Processed Image (if AI created one with overlays)
    let processedImageURL = null;
    if (analysisResults.processed_image_path && fs.existsSync(analysisResults.processed_image_path)) {
         try {
             console.log(`📤 Uploading processed image: ${analysisResults.processed_image_path}`);
             // Mocking req.file structure for uploadToCloudinary if it expects an object with path
             const processedFile = { path: analysisResults.processed_image_path };
             
             const processedUpload = await withTimeout(
                 uploadToCloudinary(processedFile, 'rubbersense/processed'),
                 15000,
                 'Processed image upload timed out'
             );
             processedImageURL = processedUpload.url;
             
             // Clean up processed file
             fs.unlinkSync(analysisResults.processed_image_path);
         } catch (e) {
             console.error("⚠️ Failed to upload processed image:", e);
             // Don't fail the whole request, just log it
         }
    }

    // 3. Delete local file after upload
    fs.unlinkSync(req.file.path);

    // Sanitize analysis results before saving
    // Remove fields not in schema or that might cause issues
    const { 
      treeIdentification, trunkAnalysis, leafAnalysis, diseaseDetection, tappabilityAssessment, 
      latexQualityPrediction, latexFlowIntensity, productivityRecommendation,
      // Latex specific fields
      latexColorAnalysis, contaminationDetection, quantityEstimation, productYieldEstimation,
      aiInsights
    } = analysisResults;

    // Ensure diseaseDetection is an array and has valid structure
    const validDiseaseDetection = Array.isArray(diseaseDetection) 
      ? diseaseDetection.map(d => ({
          name: d.name || 'Unknown',
          confidence: d.confidence || 0,
          severity: d.severity || 'low',
          recommendation: d.recommendation || '',
          ai_diagnosis: d.ai_diagnosis
        }))
      : [];

    // Create scan record
    const scan = await Scan.create({
      tree: treeId,
      user: req.user.id,
      scanType: scanType || 'tree',
      imageURL: uploadResult.url,
      processedImageURL: processedImageURL,
      cloudinaryID: uploadResult.publicId,
      treeIdentification: {
        isRubberTree: treeIdentification?.isRubberTree || true,
        confidence: treeIdentification?.confidence || 0,
        maturity: treeIdentification?.maturity || 'mature',
        detectedPart: treeIdentification?.detectedPart || 'whole_tree'
      },
      trunkAnalysis,
      leafAnalysis,
      diseaseDetection: validDiseaseDetection,
      tappabilityAssessment,
      latexQualityPrediction: latexQualityPrediction || undefined,
      latexFlowIntensity: latexFlowIntensity || undefined,
      productivityRecommendation: productivityRecommendation || undefined,
      aiInsights: aiInsights || undefined,
      // Latex specific fields
      latexColorAnalysis,
      contaminationDetection,
      quantityEstimation,
      productYieldEstimation,
      processingStatus: 'completed',
      processingTime
    });

    // Update tree with scan results
    await Tree.findByIdAndUpdate(treeId, {
      healthStatus: validDiseaseDetection[0]?.name === 'No disease detected' ? 'healthy' : 'diseased',
      isTappable: tappabilityAssessment?.isTappable || false,
      tappabilityScore: tappabilityAssessment?.score || 0,
      trunkGirth: trunkAnalysis?.girth || 0,
      trunkDiameter: trunkAnalysis?.diameter || 0,
      barkTexture: trunkAnalysis?.texture || 'unknown',
      barkColor: trunkAnalysis?.color || 'unknown',
      lastScannedAt: Date.now(),
      $inc: { totalScans: 1 }
    });

    // Populate tree details before sending response
    await scan.populate('tree', 'treeID healthStatus');

    res.status(201).json({
      success: true,
      message: 'Image uploaded and analyzed successfully',
      data: scan
    });

  } catch (error) {
    console.error('Scan upload error:', error);
    
    // Clean up file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      error: 'Server error processing image'
    });
  }
});

// ============================================
// @route   GET /api/scans
// @desc    Get all scans for user
// @access  Private
// ============================================
router.get('/', protect, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20; // Reduced default limit from 50 to 20
    const skip = (page - 1) * limit;

    const scans = await Scan.find({ user: req.user.id })
      .select('scanType imageURL createdAt treeIdentification tappabilityAssessment latexQualityPrediction processingStatus trunkAnalysis leafAnalysis diseaseDetection quantityEstimation productYieldEstimation') // Select list view fields
      .populate('tree', 'treeID location healthStatus')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(); // Use lean() for performance

    // Get total count for pagination (optional, can be skipped if too slow)
    // const total = await Scan.countDocuments({ user: req.user.id });

    res.status(200).json({
      success: true,
      count: scans.length,
      // total,
      data: scans
    });

  } catch (error) {
    console.error('Get scans error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error fetching scans'
    });
  }
});

// ============================================
// @route   GET /api/scans/:id
// @desc    Get single scan
// @access  Private
// ============================================
router.get('/:id', protect, async (req, res) => {
  try {
    const scan = await Scan.findById(req.params.id)
      .populate('tree', 'treeID location healthStatus')
      .populate('user', 'name email');

    if (!scan) {
      return res.status(404).json({
        success: false,
        error: 'Scan not found'
      });
    }

    // Check authorization
    if (scan.user._id.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to view this scan'
      });
    }

    res.status(200).json({
      success: true,
      data: scan
    });

  } catch (error) {
    console.error('Get scan error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error fetching scan'
    });
  }
});

// ============================================
// @route   POST /api/scans/:id/analyze
// @desc    Trigger manual re-analysis of a scan
// @access  Private
// ============================================
router.post('/:id/analyze', protect, async (req, res) => {
  let tempFilePath = null;
  try {
    const scan = await Scan.findById(req.params.id);
    if (!scan) {
      return res.status(404).json({ success: false, error: 'Scan not found' });
    }

    // Check authorization
    if (scan.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    console.log(`🔄 Re-analyzing scan ${scan._id}`);
    
    let analysisResults;
    const isLatex = scan.scanType === 'latex';
    // FORCE FULL RE-ANALYSIS for Trees to ensure new Trunks.pt model is used
    // We disable the optimization that skips CV for trees
    const hasPriorDetection = !isLatex && false; 

    // OPTIMIZATION: If we already have detection data, just refresh AI suggestions
    if (hasPriorDetection) {
        console.log(`⚡ [Re-analysis] Using existing detection data for AI suggestion refresh.`);
         const detectionData = {
             disease_name: scan.diseaseDetection[0].name,
             confidence: scan.diseaseDetection[0].confidence || 0,
             spot_count: scan.leafAnalysis?.spotCount || 0,
             color_name: scan.leafAnalysis?.color || 'Green',
             tappability: scan.tappabilityAssessment // Pass tappability for prompt generation
         };
         
         try {
             analysisResults = await generateAiSuggestionsOnly(detectionData);
         } catch (err) {
             console.error("AI Suggestion Gen Error:", err);
             return res.status(500).json({ success: false, error: 'AI Suggestions failed: ' + err.message });
         }
    } else {
        // FULL RE-ANALYSIS (Download + Computer Vision)
        // Download image to temp file to ensure Python script access
        try {
            console.log(`⬇️ Downloading image for re-analysis: ${scan.imageURL}`);
            const response = await axios.get(scan.imageURL, { 
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'RubberSense-Backend/1.0'
                }
            });
            const tempFileName = `reanalyze_${scan._id}_${Date.now()}.jpg`;
            // Ensure uploads directory exists (using absolute path based on CWD or relative to this file)
            const uploadDir = path.join(__dirname, '../uploads');
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }
            tempFilePath = path.join(uploadDir, tempFileName);
            fs.writeFileSync(tempFilePath, response.data);
        } catch (dlErr) {
            console.error("Failed to download image for re-analysis:", dlErr.message);
            return res.status(500).json({ success: false, error: 'Failed to retrieve scan image' });
        }
        
        // Run analysis
        try {
            if (isLatex) {
                analysisResults = await analyzeLatexImage(tempFilePath);
            } else {
                // Use 'whole_tree' as default submode if not stored
                const subMode = scan.treeIdentification?.detectedPart || 'whole_tree';
                analysisResults = await analyzeTreeImage(tempFilePath, subMode);
            }
        } catch (err) {
            console.error("Re-analysis AI Error:", err);
            return res.status(500).json({ success: false, error: 'AI Service failed during re-analysis' });
        }
    }

    if (analysisResults.error) {
        return res.status(400).json({ success: false, error: analysisResults.error });
    }

    // Update scan with new insights
    scan.aiInsights = {
        ...analysisResults.aiInsights,
        version: (scan.aiInsights?.version || 0) + 1,
        analysisTimestamp: new Date()
    };

    // Refresh other analysis fields
    if (analysisResults.diseaseDetection) {
        scan.diseaseDetection = analysisResults.diseaseDetection.map(d => ({
          name: d.name || 'Unknown',
          confidence: d.confidence || 0,
          severity: d.severity || 'low',
          recommendation: d.recommendation || '',
          ai_diagnosis: d.ai_diagnosis
        }));
    }
    
    if (analysisResults.productivityRecommendation) {
        scan.productivityRecommendation = analysisResults.productivityRecommendation;
    }

    // Update Trunk & Tappability data (Crucial for Trunks.pt integration)
    if (analysisResults.trunkAnalysis) {
        scan.trunkAnalysis = analysisResults.trunkAnalysis;
    }
    if (analysisResults.tappabilityAssessment) {
        scan.tappabilityAssessment = analysisResults.tappabilityAssessment;
    }
    if (analysisResults.treeIdentification) {
        // Merge carefully to avoid overwriting existing tree ID confidence if new one is lower, 
        // but Trunks.pt is specialized so we trust it for 'detectedPart'
        scan.treeIdentification = {
            ...scan.treeIdentification,
            ...analysisResults.treeIdentification
        };
    }
    
    // Save changes
    await scan.save();

    res.json({
        success: true,
        message: 'Re-analysis complete',
        data: scan
    });

  } catch (error) {
    console.error('Re-analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during re-analysis'
    });
  } finally {
      // Clean up temp file
      if (tempFilePath && fs.existsSync(tempFilePath)) {
          try {
              fs.unlinkSync(tempFilePath);
          } catch (e) {
              console.error("Failed to delete temp file:", e);
          }
      }
  }
});

module.exports = router;
