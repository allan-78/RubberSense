// ============================================
// 🥛 Latex Analysis Routes
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const fs = require('fs');
const LatexBatch = require('../models/LatexBatch');
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { uploadToCloudinary } = require('../config/cloudinary');
const { analyzeLatexImage } = require('../utils/imageAnalysis');
const { estimateLatexPrice } = require('../utils/marketPrice');

// ============================================
// @route   POST /api/latex/batch
// @desc    Create latex batch with analysis
// @access  Private
// ============================================
router.post('/batch', protect, upload.single('image'), async (req, res) => {
  try {
    const { batchID, collectionDate, notes } = req.body;

    // Validation
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Please upload an image file'
      });
    }

    if (!batchID) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        error: 'Batch ID is required'
      });
    }

    // Check if batch ID already exists (Globally, not just for user)
    let finalBatchID = batchID;
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      const exists = await LatexBatch.exists({ batchID: finalBatchID });
      if (!exists) break;

      // If exists, append a random suffix to make it unique
      const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
      // If batchID already has a suffix pattern (e.g. ID-XXXX), replace it or append?
      // Simple approach: just append
      finalBatchID = `${batchID}-${randomSuffix}`;
      attempts++;
    }

    if (attempts === maxAttempts) {
       return res.status(400).json({
        success: false,
        error: 'Unable to generate unique Batch ID. Please try again.'
      });
    }

    // Upload to Cloudinary
    const uploadResult = await uploadToCloudinary(req.file, 'rubbersense/latex');

    // Delete local file
    fs.unlinkSync(req.file.path);

    // Analyze latex image
    const analysisResults = await analyzeLatexImage(uploadResult.url);

    // Calculate market price
    const priceEstimation = estimateLatexPrice(
      analysisResults.qualityClassification.grade,
      analysisResults.productYieldEstimation.dryRubberContent,
      analysisResults.quantityEstimation.weight
    );

    // Create latex batch
    const latexBatch = await LatexBatch.create({
      user: req.user.id,
      batchID: finalBatchID,
      collectionDate: collectionDate || Date.now(),
      imageURL: uploadResult.url,
      cloudinaryID: uploadResult.publicId,
      colorAnalysis: analysisResults.colorAnalysis,
      qualityClassification: analysisResults.qualityClassification,
      contaminationDetection: analysisResults.contaminationDetection,
      quantityEstimation: analysisResults.quantityEstimation,
      productYieldEstimation: analysisResults.productYieldEstimation,
      productRecommendation: analysisResults.productRecommendation,
      marketPriceEstimation: priceEstimation,
      processingStatus: 'completed',
      notes
    });

    res.status(201).json({
      success: true,
      message: 'Latex batch created and analyzed successfully',
      data: latexBatch
    });

  } catch (error) {
    console.error('Latex batch error:', error);
    
    // Clean up file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      error: 'Server error processing latex batch'
    });
  }
});

// ============================================
// @route   GET /api/latex
// @desc    Get all latex batches for user
// @access  Private
// ============================================
router.get('/', protect, async (req, res) => {
  try {
    const { limit = 20, page = 1 } = req.query; // Reduced default limit from 50 to 20

    const batches = await LatexBatch.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .lean(); // Use lean() for performance

    // Only count if needed (optional)
    const total = await LatexBatch.countDocuments({ user: req.user.id });

    res.status(200).json({
      success: true,
      count: batches.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: batches
    });

  } catch (error) {
    console.error('Get latex batches error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error fetching latex batches'
    });
  }
});

// ============================================
// @route   GET /api/latex/:id
// @desc    Get single latex batch
// @access  Private
// ============================================
router.get('/:id', protect, async (req, res) => {
  try {
    const batch = await LatexBatch.findById(req.params.id)
      .populate('user', 'name email');

    if (!batch) {
      return res.status(404).json({
        success: false,
        error: 'Latex batch not found'
      });
    }

    // Check authorization
    if (batch.user._id.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to view this batch'
      });
    }

    res.status(200).json({
      success: true,
      data: batch
    });

  } catch (error) {
    console.error('Get latex batch error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error fetching latex batch'
    });
  }
});

// ============================================
// @route   GET /api/latex/stats/summary
// @desc    Get latex statistics and revenue
// @access  Private
// ============================================
router.get('/stats/summary', protect, async (req, res) => {
  try {
    const stats = await LatexBatch.aggregate([
      { $match: { user: req.user._id } },
      {
        $group: {
          _id: null,
          totalBatches: { $sum: 1 },
          totalRevenue: { $sum: '$marketPriceEstimation.totalEstimatedValue' },
          totalVolume: { $sum: '$quantityEstimation.weight' },
          gradeA: { $sum: { $cond: [{ $eq: ['$qualityClassification.grade', 'A'] }, 1, 0] } },
          gradeB: { $sum: { $cond: [{ $eq: ['$qualityClassification.grade', 'B'] }, 1, 0] } },
          gradeC: { $sum: { $cond: [{ $eq: ['$qualityClassification.grade', 'C'] }, 1, 0] } },
          gradeD: { $sum: { $cond: [{ $eq: ['$qualityClassification.grade', 'D'] }, 1, 0] } },
          gradeF: { $sum: { $cond: [{ $eq: ['$qualityClassification.grade', 'F'] }, 1, 0] } },
          totalGradePoints: {
            $sum: {
              $switch: {
                branches: [
                  { case: { $eq: ['$qualityClassification.grade', 'A'] }, then: 5 },
                  { case: { $eq: ['$qualityClassification.grade', 'B'] }, then: 4 },
                  { case: { $eq: ['$qualityClassification.grade', 'C'] }, then: 3 },
                  { case: { $eq: ['$qualityClassification.grade', 'D'] }, then: 2 },
                  { case: { $eq: ['$qualityClassification.grade', 'F'] }, then: 1 }
                ],
                default: 0
              }
            }
          }
        }
      }
    ]);

    const result = stats[0] || {
      totalBatches: 0,
      totalRevenue: 0,
      totalVolume: 0,
      gradeA: 0, gradeB: 0, gradeC: 0, gradeD: 0, gradeF: 0,
      totalGradePoints: 0
    };

    const qualityDistribution = {
      A: result.gradeA,
      B: result.gradeB,
      C: result.gradeC,
      D: result.gradeD,
      F: result.gradeF
    };

    const averageQuality = result.totalBatches > 0 
      ? result.totalGradePoints / result.totalBatches 
      : 0;

    res.status(200).json({
      success: true,
      data: {
        totalBatches: result.totalBatches,
        totalRevenue: parseFloat(result.totalRevenue.toFixed(2)),
        totalVolume: parseFloat(result.totalVolume.toFixed(2)),
        averageQuality: parseFloat(averageQuality.toFixed(2)),
        qualityDistribution,
        currency: 'PHP'
      }
    });

  } catch (error) {
    console.error('Get latex stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error fetching latex statistics'
    });
  }
});

// ============================================
// @route   DELETE /api/latex/:id
// @desc    Delete latex batch
// @access  Private
// ============================================
router.delete('/:id', protect, async (req, res) => {
  try {
    const batch = await LatexBatch.findById(req.params.id);

    if (!batch) {
      return res.status(404).json({
        success: false,
        error: 'Latex batch not found'
      });
    }

    // Check authorization
    if (batch.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to delete this batch'
      });
    }

    await batch.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Latex batch deleted successfully',
      data: {}
    });

  } catch (error) {
    console.error('Delete latex batch error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error deleting batch'
    });
  }
});

module.exports = router;
