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
const { analyzeTreeImage } = require('../utils/imageAnalysis');

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
    const { treeId, scanType } = req.body;

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

    // Analyze image (placeholder - will use ML model later)
    const startTime = Date.now();
    const analysisResults = await analyzeTreeImage(uploadResult.url);
    const processingTime = Date.now() - startTime;

    // Create scan record
    const scan = await Scan.create({
      tree: treeId,
      user: req.user.id,
      scanType: scanType || 'tree',
      imageURL: uploadResult.url,
      cloudinaryID: uploadResult.publicId,
      ...analysisResults,
      processingStatus: 'completed',
      processingTime
    });

    // Update tree with scan results
    await Tree.findByIdAndUpdate(treeId, {
      healthStatus: analysisResults.diseaseDetection[0]?.name === 'No disease detected' ? 'healthy' : 'diseased',
      isTappable: analysisResults.tappabilityAssessment.isTappable,
      tappabilityScore: analysisResults.tappabilityAssessment.score,
      trunkGirth: analysisResults.trunkAnalysis.girth,
      trunkDiameter: analysisResults.trunkAnalysis.diameter,
      barkTexture: analysisResults.trunkAnalysis.texture,
      barkColor: analysisResults.trunkAnalysis.color,
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
