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

const normalizeSeverity = (severity, fallback = 'unknown') => {
  const value = String(severity || '').trim().toLowerCase();
  if (!value) return fallback;

  if (['none', 'healthy', 'no disease'].includes(value)) return 'none';
  if (['low', 'mild'].includes(value)) return 'low';
  if (['moderate', 'medium'].includes(value)) return 'moderate';
  if (['high', 'severe'].includes(value)) return 'high';
  if (value === 'critical') return 'critical';
  if (['unknown', 'uncertain'].includes(value)) return 'unknown';

  return fallback;
};

const readMixedText = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(readMixedText).filter(Boolean).join(' ');
  }
  if (typeof value === 'object') {
    return Object.values(value).map(readMixedText).filter(Boolean).join(' ');
  }
  return '';
};

const aiDiagnosisSaysHealthy = (aiDiagnosis) => {
  const text = readMixedText(aiDiagnosis).toLowerCase();
  if (!text) return false;

  const explicitHealthyPattern =
    /(no\s+(signs?|evidence)\s+of\s+(disease|infection)|no disease detected|disease[-\s]?free|appears healthy|tree is healthy)/i;
  if (explicitHealthyPattern.test(text)) return true;

  const hasHealthyWord = /\bhealthy\b/i.test(text);
  const hasDiseaseWord =
    /\b(diseased?|infection|infected|blight|mildew|rot|canker|fungal?|lesion|necrosis|rust|pustule)\b/i.test(text);

  return hasHealthyWord && !hasDiseaseWord;
};

const nameSuggestsHealthy = (name) => {
  const value = String(name || '').toLowerCase();
  return /(healthy|no disease|disease[-\s]?free|normal)/i.test(value);
};

const nameSuggestsDisease = (name) => {
  const value = String(name || '').toLowerCase();
  if (!value) return false;
  if (nameSuggestsHealthy(value)) return false;
  return /(disease|blight|spot|mildew|rot|canker|mold|fung|infect|lesion|necrosis|rust|pustule)/i.test(value);
};

const normalizeDiseaseDetection = (diseaseDetection = []) => {
  const input = Array.isArray(diseaseDetection) ? diseaseDetection : [];
  return input.map((disease) => {
    const confidence = Number(disease?.confidence);
    return {
      name: String(disease?.name || 'Unknown').trim(),
      confidence: Number.isFinite(confidence) ? confidence : 0,
      severity: normalizeSeverity(disease?.severity, 'unknown'),
      recommendation: readMixedText(disease?.recommendation).trim(),
      ai_diagnosis: disease?.ai_diagnosis
    };
  });
};

const resolveHealthStatusFromDisease = (disease) => {
  if (!disease) return 'unknown';

  if (aiDiagnosisSaysHealthy(disease.ai_diagnosis)) return 'healthy';
  if (disease.severity === 'none') return 'healthy';
  if (nameSuggestsHealthy(disease.name)) return 'healthy';

  if (['low', 'moderate', 'high', 'critical'].includes(disease.severity)) return 'diseased';
  if (nameSuggestsDisease(disease.name)) return 'diseased';

  return 'unknown';
};

const normalizeTreeAnalysisResult = (analysisResults = {}) => {
  const normalizedDetection = normalizeDiseaseDetection(analysisResults.diseaseDetection);
  const primaryDisease = normalizedDetection[0] || {
    name: 'No disease detected',
    confidence: 0,
    severity: 'none',
    recommendation: 'Tree appears healthy. Continue routine monitoring.',
    ai_diagnosis: null
  };

  let resolvedHealthStatus = resolveHealthStatusFromDisease(primaryDisease);

  if (resolvedHealthStatus === 'healthy') {
    primaryDisease.name = nameSuggestsHealthy(primaryDisease.name) ? primaryDisease.name : 'No disease detected';
    primaryDisease.severity = 'none';
    if (!primaryDisease.recommendation) {
      primaryDisease.recommendation = 'Tree appears healthy. Continue routine monitoring.';
    }
  } else if (resolvedHealthStatus === 'diseased' && primaryDisease.severity === 'none') {
    primaryDisease.severity = 'moderate';
  }

  const diseaseDetection = [primaryDisease, ...normalizedDetection.slice(1)];

  const leafAnalysis = analysisResults.leafAnalysis
    ? { ...analysisResults.leafAnalysis }
    : analysisResults.treeIdentification?.detectedPart === 'leaf'
      ? {}
      : analysisResults.leafAnalysis;

  const trunkAnalysis = analysisResults.trunkAnalysis
    ? { ...analysisResults.trunkAnalysis }
    : analysisResults.treeIdentification?.detectedPart === 'trunk'
      ? {}
      : analysisResults.trunkAnalysis;

  if (leafAnalysis && (analysisResults.treeIdentification?.detectedPart === 'leaf')) {
    leafAnalysis.healthStatus = resolvedHealthStatus === 'unknown' ? (leafAnalysis.healthStatus || 'unknown') : resolvedHealthStatus;
  }

  if (trunkAnalysis && (analysisResults.treeIdentification?.detectedPart === 'trunk' || analysisResults.treeIdentification?.detectedPart === 'whole_tree')) {
    trunkAnalysis.healthStatus = resolvedHealthStatus === 'unknown' ? (trunkAnalysis.healthStatus || 'unknown') : resolvedHealthStatus;
    if (resolvedHealthStatus === 'healthy') {
      trunkAnalysis.damages = [];
    } else if (resolvedHealthStatus === 'diseased') {
      trunkAnalysis.damages = [primaryDisease.name];
    }
  }

  const tappabilityAssessment = analysisResults.tappabilityAssessment
    ? { ...analysisResults.tappabilityAssessment }
    : undefined;

  if (tappabilityAssessment) {
    if (resolvedHealthStatus === 'healthy' && typeof tappabilityAssessment.isTappable !== 'boolean') {
      tappabilityAssessment.isTappable = true;
    }
    if (resolvedHealthStatus === 'diseased' && tappabilityAssessment.isTappable === true) {
      tappabilityAssessment.isTappable = false;
    }
  }

  const productivityRecommendation = analysisResults.productivityRecommendation
    ? { ...analysisResults.productivityRecommendation }
    : undefined;

  if (productivityRecommendation && resolvedHealthStatus !== 'unknown') {
    productivityRecommendation.status = resolvedHealthStatus === 'healthy' ? 'optimal' : (productivityRecommendation.status || 'at_risk');
  }

  return {
    ...analysisResults,
    diseaseDetection,
    leafAnalysis,
    trunkAnalysis,
    tappabilityAssessment,
    productivityRecommendation,
    resolvedHealthStatus
  };
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
          analysisResults = normalizeTreeAnalysisResult(analysisResults);
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
    // Increased timeout to 60s for slow connections
    const uploadResult = await withTimeout(
      uploadToCloudinary(req.file, 'rubbersense/scans'),
      60000,
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
                 45000,
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
      ? normalizeDiseaseDetection(diseaseDetection)
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
    const primaryDisease = validDiseaseDetection[0];
    const nextHealthStatus = analysisResults.resolvedHealthStatus && analysisResults.resolvedHealthStatus !== 'unknown'
      ? analysisResults.resolvedHealthStatus
      : primaryDisease
      ? resolveHealthStatusFromDisease(primaryDisease)
      : tree.healthStatus;

    const treeUpdatePayload = {
      healthStatus: nextHealthStatus,
      isTappable: tappabilityAssessment?.isTappable || false,
      tappabilityScore: tappabilityAssessment?.score || 0,
      lastScannedAt: Date.now(),
      $inc: { totalScans: 1 }
    };

    // Keep trunk descriptors if present, but do not force/update girth values.
    if (trunkAnalysis?.texture) treeUpdatePayload.barkTexture = trunkAnalysis.texture;
    if (trunkAnalysis?.color) treeUpdatePayload.barkColor = trunkAnalysis.color;
    if (typeof trunkAnalysis?.diameter === 'number') treeUpdatePayload.trunkDiameter = trunkAnalysis.diameter;

    await Tree.findByIdAndUpdate(treeId, treeUpdatePayload);

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

    if (!isLatex) {
      analysisResults = normalizeTreeAnalysisResult(analysisResults);
    }

    // Update scan with new insights
    scan.aiInsights = {
        ...analysisResults.aiInsights,
        version: (scan.aiInsights?.version || 0) + 1,
        analysisTimestamp: new Date()
    };

    // Refresh other analysis fields
    if (analysisResults.diseaseDetection) {
        scan.diseaseDetection = normalizeDiseaseDetection(analysisResults.diseaseDetection);
    }

    if (analysisResults.leafAnalysis) {
        scan.leafAnalysis = analysisResults.leafAnalysis;
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

    if (!isLatex && scan.tree) {
        const updatedPrimaryDisease = scan.diseaseDetection?.[0];
        const resolvedHealthStatus = analysisResults.resolvedHealthStatus && analysisResults.resolvedHealthStatus !== 'unknown'
          ? analysisResults.resolvedHealthStatus
          : resolveHealthStatusFromDisease(updatedPrimaryDisease);

        const treeUpdatePayload = {
          lastScannedAt: Date.now()
        };

        if (resolvedHealthStatus && resolvedHealthStatus !== 'unknown') {
          treeUpdatePayload.healthStatus = resolvedHealthStatus;
        }

        if (analysisResults.tappabilityAssessment) {
          treeUpdatePayload.isTappable = analysisResults.tappabilityAssessment.isTappable || false;
          treeUpdatePayload.tappabilityScore = analysisResults.tappabilityAssessment.score || 0;
        }

        if (analysisResults.trunkAnalysis?.texture) treeUpdatePayload.barkTexture = analysisResults.trunkAnalysis.texture;
        if (analysisResults.trunkAnalysis?.color) treeUpdatePayload.barkColor = analysisResults.trunkAnalysis.color;
        if (typeof analysisResults.trunkAnalysis?.diameter === 'number') treeUpdatePayload.trunkDiameter = analysisResults.trunkAnalysis.diameter;

        await Tree.findByIdAndUpdate(scan.tree, treeUpdatePayload);
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
