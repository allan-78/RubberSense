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

const normalizeTextList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, val]) => `${key}: ${String(val || '').trim()}`.trim())
      .filter(Boolean);
  }
  const text = String(value).trim();
  return text ? [text] : [];
};

const normalizeLatexRecommendation = (analysisResults) => {
  const recommendation = analysisResults.productRecommendation || {};
  const aiSuggestions = normalizeTextList(analysisResults.aiInsights?.suggestions);
  const recommendedUses = normalizeTextList(recommendation.recommendedUses);

  const expectedQuality = recommendation.expectedQuality
    || (analysisResults.qualityClassification?.grade ? `Grade ${analysisResults.qualityClassification.grade}` : 'N/A');

  const recommendedProduct = String(
    recommendation.recommendedProduct
    || analysisResults.productYieldEstimation?.productType
    || 'AI recommendation unavailable'
  ).trim();

  const reason = String(
    recommendation.reason
    || aiSuggestions[0]
    || 'AI recommendation unavailable. Please re-analyze when service is available.'
  ).trim();

  const marketValueInsight = String(
    recommendation.marketValueInsight
    || aiSuggestions[1]
    || 'AI market insight unavailable.'
  ).trim();

  const preservation = String(
    recommendation.preservation
    || aiSuggestions[2]
    || 'AI preservation advice unavailable.'
  ).trim();

  return {
    recommendedProduct,
    reason,
    expectedQuality,
    recommendedUses: recommendedUses.slice(0, 8),
    marketValueInsight,
    preservation
  };
};

// ============================================
// @route   POST /api/latex/batch
// @desc    Create latex batch with analysis
// @access  Private
// ============================================
router.post('/batch', protect, (req, res, next) => {
  console.log('📥 Received /api/latex/batch request');
  console.log('📝 Headers:', req.headers['content-type']);
  upload.single('image')(req, res, (err) => {
    if (err) {
      console.error('❌ Upload middleware error:', err);
      return res.status(400).json({ success: false, error: err.message });
    }
    console.log('✅ File uploaded:', req.file ? req.file.filename : 'No file');
    console.log('📦 Body:', req.body);
    next();
  });
}, async (req, res) => {
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

    // Strict category validation: latex scanner must only accept latex content.
    if (
      analysisResults.error &&
      String(analysisResults.error).toLowerCase().includes('detected part non-latex only')
    ) {
      return res.status(400).json({
        success: false,
        error: analysisResults.error,
        details: analysisResults
      });
    }

    analysisResults.productRecommendation = normalizeLatexRecommendation(analysisResults);

    // Handle user inputs for Volume and Dry Weight (Override AI estimation if provided)
    // Trim and sanitize inputs
    let userVolumeStr = req.body.volume ? String(req.body.volume).trim().replace(',', '.') : '0';
    let userDRCStr = req.body.dryWeight ? String(req.body.dryWeight).trim().replace(',', '.') : '0';
    
    let userVolume = parseFloat(userVolumeStr);
    let userDRC = parseFloat(userDRCStr);
    
    console.log(`📊 Parsed User Input - Volume: ${userVolume} (raw: ${req.body.volume}), DRC: ${userDRC} (raw: ${req.body.dryWeight})`);

    if (!isNaN(userVolume) && userVolume > 0) {
        analysisResults.quantityEstimation = {
            ...analysisResults.quantityEstimation,
            volume: userVolume,
            weight: userVolume, // Assuming 1kg/L roughly for simplicity
            confidence: 100 // User input is 100% confident
        };
    }

    if (!isNaN(userDRC) && userDRC > 0) {
        analysisResults.productYieldEstimation = {
            ...analysisResults.productYieldEstimation,
            dryRubberContent: userDRC,
            confidence: 100 // User input is 100% confident
        };
    }

    // Handle analysis failure
    let qualityGrade = 'F';
    let drContent = 33.0;
    let volume = 0;
    let processingStatus = 'completed';

    if (analysisResults.error) {
      console.error('⚠️ Latex Analysis Failed:', analysisResults.error);
      processingStatus = 'failed';
      // Use defaults for failed analysis
      analysisResults.qualityClassification = {
        grade: 'F',
        confidence: 0,
        description: 'Analysis failed: ' + analysisResults.error
      };
      // Keep user inputs even if analysis fails
      analysisResults.productYieldEstimation = {
        dryRubberContent: !isNaN(userDRC) && userDRC > 0 ? userDRC : 33.0,
        estimatedYield: 0,
        productType: 'Unknown'
      };
      analysisResults.quantityEstimation = { 
          volume: !isNaN(userVolume) && userVolume > 0 ? userVolume : 0, 
          weight: !isNaN(userVolume) && userVolume > 0 ? userVolume : 0, 
          confidence: 0 
      };
    } else {
      qualityGrade = analysisResults.qualityClassification?.grade || 'F';
      // Use user input if available, otherwise AI
      drContent = !isNaN(userDRC) && userDRC > 0 ? userDRC : (analysisResults.productYieldEstimation?.dryRubberContent || 33.0);
      volume = !isNaN(userVolume) && userVolume > 0 ? userVolume : (analysisResults.quantityEstimation?.weight || analysisResults.quantityEstimation?.volume || 0);
      
      // Update the analysis object with the definitive values used for calculation
      if (!analysisResults.productYieldEstimation) analysisResults.productYieldEstimation = {};
      analysisResults.productYieldEstimation.dryRubberContent = drContent;
      
      if (!analysisResults.quantityEstimation) analysisResults.quantityEstimation = {};
      analysisResults.quantityEstimation.volume = volume;
      analysisResults.quantityEstimation.weight = volume;
    }

    // Calculate market price
    const priceEstimation = estimateLatexPrice(
      qualityGrade,
      drContent,
      volume,
      analysisResults.marketAnalysis
    );

    // Ensure numeric values
    if (isNaN(priceEstimation.totalEstimatedValue)) {
        console.warn('⚠️ Market price calculation resulted in NaN, defaulting to 0');
        priceEstimation.totalEstimatedValue = 0;
        priceEstimation.pricePerKg = 0;
    }

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
      productRecommendation: normalizeLatexRecommendation(analysisResults),
      marketPriceEstimation: priceEstimation,
      aiInsights: analysisResults.aiInsights,
      processingStatus: processingStatus,
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
// @route   POST /api/latex/:id/analyze
// @desc    Re-analyze latex batch with latest AI models
// @access  Private
// ============================================
router.post('/:id/analyze', protect, async (req, res) => {
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
        error: 'Not authorized to analyze this batch'
      });
    }

    // Analyze latex image again
    const analysisResults = await analyzeLatexImage(batch.imageURL);

    if (analysisResults.error) {
        return res.status(500).json({
            success: false,
            error: 'Re-analysis failed: ' + analysisResults.error
        });
    }

    analysisResults.productRecommendation = normalizeLatexRecommendation(analysisResults);

    // Preserve User Inputs (Volume/DRC) if they were set with high confidence (User Input)
    // or simply if they exist, because AI currently returns 0 for volume.
    // We assume if volume > 0, it was user input or valid estimation.
    let currentVolume = batch.quantityEstimation?.volume || 0;
    let currentDRC = batch.productYieldEstimation?.dryRubberContent || 0;
    let volumeConfidence = batch.quantityEstimation?.confidence || 0;

    // Apply User Overrides to Analysis Results
    if (volumeConfidence === 100 || currentVolume > 0) {
        analysisResults.quantityEstimation = {
            ...analysisResults.quantityEstimation,
            volume: currentVolume,
            weight: currentVolume,
            confidence: 100
        };
    }
    
    // Check if DRC was user entered (confidence 100)
    let currentDRCConfidence = batch.productYieldEstimation?.confidence || 0;

    // Preserve User Input for DRC (Confidence 100)
    if (currentDRCConfidence === 100 && currentDRC > 0) {
         analysisResults.productYieldEstimation = {
             ...analysisResults.productYieldEstimation,
             dryRubberContent: currentDRC,
             confidence: 100
         };
    } else if (volumeConfidence === 100 && currentDRC > 0 && currentDRC !== 33.0) {
        // Fallback for legacy data: If volume is manual and DRC is not default, assume manual DRC
         analysisResults.productYieldEstimation = {
             ...analysisResults.productYieldEstimation,
             dryRubberContent: currentDRC,
             confidence: 100 // Upgrade to explicit confidence
         };
    }

    // Calculate market price with final data
    const qualityGrade = analysisResults.qualityClassification?.grade || 'F';
    const drContent = analysisResults.productYieldEstimation?.dryRubberContent || 33.0;
    const volume = analysisResults.quantityEstimation?.volume || 0;

    console.log(`💰 Re-calculating price with: Grade=${qualityGrade}, DRC=${drContent}, Vol=${volume}`);

    const priceEstimation = estimateLatexPrice(
      qualityGrade,
      drContent,
      volume,
      analysisResults.marketAnalysis
    );

    // Update batch
    batch.colorAnalysis = analysisResults.colorAnalysis;
    batch.qualityClassification = analysisResults.qualityClassification;
    batch.contaminationDetection = analysisResults.contaminationDetection;
    batch.quantityEstimation = analysisResults.quantityEstimation;
    batch.productYieldEstimation = analysisResults.productYieldEstimation;
    batch.productRecommendation = normalizeLatexRecommendation(analysisResults);
    batch.marketPriceEstimation = priceEstimation;
    batch.aiInsights = analysisResults.aiInsights;
    batch.processingStatus = 'completed';
    batch.analyzedAt = Date.now(); // Add timestamp for re-analysis

    await batch.save();

    res.status(200).json({
      success: true,
      message: 'Latex batch re-analyzed successfully',
      data: batch
    });

  } catch (error) {
    console.error('Re-analyze latex batch error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error analyzing latex batch'
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
      message: 'Latex batch deleted successfully'
    });

  } catch (error) {
    console.error('Delete latex batch error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error deleting latex batch'
    });
  }
});

module.exports = router;
