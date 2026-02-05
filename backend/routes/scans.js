// ============================================
// 📸 Scan & Image Processing Routes
// ============================================

const express = require('express');
const router = express.Router();
const fs = require('fs');
const Scan = require('../models/Scan');
const Tree = require('../models/Tree');
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { uploadToCloudinary } = require('../config/cloudinary');
const { analyzeTreeImage, analyzeLatexImage } = require('../utils/imageAnalysis');

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

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

    // Upload to Cloudinary
    const uploadResult = await uploadToCloudinary(req.file, 'rubbersense/scans');

    // Delete local file after upload
    fs.unlinkSync(req.file.path);

    // Analyze image
    const startTime = Date.now();
    let analysisResults;
    if (scanType === 'latex') {
      analysisResults = await analyzeLatexImage(uploadResult.url);
    } else {
      analysisResults = await analyzeTreeImage(uploadResult.url, scanSubType);
    }
    const processingTime = Date.now() - startTime;

    // Check for AI validation errors (e.g. Not a tree)
    if (analysisResults.error) {
      return res.status(400).json({
        success: false,
        error: analysisResults.error,
        details: analysisResults
      });
    }

    // Sanitize analysis results before saving
    // Remove fields not in schema or that might cause issues
    const { 
      treeIdentification, trunkAnalysis, leafAnalysis, diseaseDetection, tappabilityAssessment, 
      latexQualityPrediction, latexFlowIntensity, productivityRecommendation,
      // Latex specific fields
      latexColorAnalysis, contaminationDetection, quantityEstimation, productYieldEstimation
    } = analysisResults;

    // Ensure diseaseDetection is an array and has valid structure
    const validDiseaseDetection = Array.isArray(diseaseDetection) 
      ? diseaseDetection.map(d => ({
          name: d.name || 'Unknown',
          confidence: d.confidence || 0,
          severity: d.severity || 'low',
          recommendation: d.recommendation || ''
        }))
      : [];

    // Create scan record
    const scan = await Scan.create({
      tree: treeId,
      user: req.user.id,
      scanType: scanType || 'tree',
      imageURL: uploadResult.url,
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
      .select('scanType imageURL createdAt treeIdentification tappabilityAssessment latexQualityPrediction processingStatus') // Select only list view fields
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

module.exports = router;
