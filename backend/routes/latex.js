// ============================================
// 🥛 Latex Analysis Routes
// ============================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const fs = require('fs');
const LatexBatch = require('../models/LatexBatch');
const LatexAnalysis = require('../models/LatexAnalysis');
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { uploadToCloudinary } = require('../config/cloudinary');
const { analyzeLatexImage } = require('../utils/imageAnalysis');
const { estimateLatexPrice } = require('../utils/marketPrice');

const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const toNumber = (value, fallback = 0) => {
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : fallback;
};

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

const normalizeUseFieldKey = (rawKey = '') => {
  const compact = String(rawKey || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

  if (!compact) return '';
  if (compact.includes('product')) return 'product';
  if (compact === 'usecase' || compact === 'usecases' || compact === 'ysecase' || compact === 'use') return 'useCase';
  if (compact === 'why' || compact === 'reason' || compact === 'rationale') return 'why';
  return '';
};

const buildRecommendedUseText = ({ product, useCase, why, extras = [] }) => {
  const clean = (value) => String(value || '').replace(/^[-*\u2022]\s*/, '').trim();
  const productText = clean(product);
  const useCaseText = clean(useCase);
  const whyText = clean(why);
  const extraText = (Array.isArray(extras) ? extras : [])
    .map((item) => clean(item))
    .filter(Boolean);

  if (!productText && !useCaseText && !whyText && !extraText.length) return '';

  const segments = [];
  if (productText) segments.push(productText);
  if (useCaseText) segments.push(`Use case: ${useCaseText}`);
  if (whyText) segments.push(`Why: ${whyText}`);
  if (extraText.length) segments.push(extraText.join(' | '));
  return segments.join(' - ');
};

const parseRecommendedUseFromString = (rawValue) => {
  const text = String(rawValue || '').trim();
  if (!text) return '';

  const cleaned = text
    .replace(/^[{[]+/, '')
    .replace(/[}\]]+$/, '')
    .trim();

  if (!cleaned) return '';

  const tokens = cleaned
    .split(/\n|;\s*|\|\s*/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (!tokens.length) return '';

  const parsed = { product: '', useCase: '', why: '' };
  const extras = [];
  let pendingKey = '';

  for (const token of tokens) {
    const parts = token.split(':');
    if (parts.length > 1) {
      const key = normalizeUseFieldKey(parts.shift());
      const value = parts.join(':').trim();
      if (key && value) {
        parsed[key] = value;
        pendingKey = '';
        continue;
      }
      if (key && !value) {
        pendingKey = key;
        continue;
      }
    }

    const standaloneKey = normalizeUseFieldKey(token);
    if (standaloneKey) {
      pendingKey = standaloneKey;
      continue;
    }

    if (pendingKey) {
      parsed[pendingKey] = token;
      pendingKey = '';
      continue;
    }

    extras.push(token);
  }

  const combined = buildRecommendedUseText({
    product: parsed.product,
    useCase: parsed.useCase,
    why: parsed.why,
    extras,
  });
  return combined || cleaned.replace(/^[-*\u2022]\s*/, '').trim();
};

const normalizeRecommendedUseEntry = (value) => {
  if (value == null) return '';

  if (typeof value === 'object' && !Array.isArray(value)) {
    const product =
      value.product ??
      value.recommendedProduct ??
      value.product_name ??
      value.name ??
      '';
    const useCase =
      value.use_case ??
      value.useCase ??
      value.usecase ??
      value.yse_case ??
      value['use case'] ??
      '';
    const why =
      value.why ??
      value.reason ??
      value.rationale ??
      '';

    const fromObject = buildRecommendedUseText({ product, useCase, why });
    if (fromObject) return fromObject;

    return Object.entries(value)
      .map(([key, val]) => `${String(key || '').trim()}: ${String(val || '').trim()}`.trim())
      .filter(Boolean)
      .join(' - ');
  }

  return parseRecommendedUseFromString(value);
};

const normalizeRecommendedUses = (value, maxItems = 8) => {
  if (!value) return [];

  const asArray = Array.isArray(value)
    ? value
    : (typeof value === 'object' ? Object.values(value) : [value]);

  const normalized = asArray
    .flatMap((entry) => {
      if (Array.isArray(entry)) return entry;
      return [entry];
    })
    .map((entry) => normalizeRecommendedUseEntry(entry))
    .flatMap((entry) =>
      String(entry || '')
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
    )
    .map((entry) => entry.replace(/^[-*\u2022]\s*/, '').trim())
    .filter(Boolean);

  return [...new Set(normalized)].slice(0, maxItems);
};

const normalizeLatexRecommendation = (analysisResults) => {
  const recommendation = analysisResults.productRecommendation || {};
  const recommendedUses = normalizeRecommendedUses(recommendation.recommendedUses, 8);

  const expectedQuality = recommendation.expectedQuality
    || (analysisResults.qualityClassification?.grade ? `Grade ${analysisResults.qualityClassification.grade}` : 'N/A');

  const recommendedProduct = String(
    recommendation.recommendedProduct
    || analysisResults.productYieldEstimation?.productType
    || 'AI recommendation unavailable'
  ).trim();

  const reason = String(recommendation.reason || 'AI recommendation unavailable. Please re-analyze when Groq is available.').trim();

  const marketValueInsight = String(recommendation.marketValueInsight || 'AI market insight unavailable.').trim();

  const preservation = String(recommendation.preservation || 'AI preservation advice unavailable.').trim();

  return {
    recommendedProduct,
    reason,
    expectedQuality,
    recommendedUses: recommendedUses.slice(0, 8),
    marketValueInsight,
    preservation
  };
};

const qualityFromGrade = (grade) => {
  const g = String(grade || '').toUpperCase();
  if (['A', 'B'].includes(g)) return 'High';
  if (g === 'C') return 'Medium';
  if (['D', 'F'].includes(g)) return 'Low';
  return 'Unknown';
};

const qualityScoreFromGrade = (grade) => {
  const g = String(grade || '').toUpperCase();
  if (g === 'A') return 95;
  if (g === 'B') return 80;
  if (g === 'C') return 60;
  if (g === 'D') return 40;
  if (g === 'F') return 20;
  return 0;
};

const normalizeLatexList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  if (typeof value === 'object') return Object.values(value).map((item) => String(item || '').trim()).filter(Boolean);
  return String(value)
    .split(/\n|;\s+|\|\s*/)
    .map((item) => item.replace(/^[-*\u2022]\s*/, '').trim())
    .filter(Boolean);
};

const normalizeBulletList = (value, maxItems = 8) => {
  if (!value) return [];

  const asArray = Array.isArray(value)
    ? value
    : (typeof value === 'object' ? Object.values(value) : [value]);

  return asArray
    .flatMap((item) =>
      String(item ?? '')
        .replace(/\r/g, '\n')
        .split(/\n|;\s+|\|\s*/)
        .map((part) => part.replace(/^[-*\u2022]\s*/, '').trim())
        .filter(Boolean)
    )
    .slice(0, maxItems);
};

const sanitizeColorAnalysis = (colorAnalysis = {}) => {
  const primaryColor = String(colorAnalysis?.primaryColor || '').trim();
  const hex = String(colorAnalysis?.hex || '').trim();

  return {
    primaryColor: primaryColor || 'Unknown',
    hex: hex || '',
  };
};

const computeEstimatedYieldKg = (volumeLiters, dryRubberContentPercent) => {
  const volume = toNumber(volumeLiters, 0);
  const drc = Math.max(0, Math.min(100, toNumber(dryRubberContentPercent, 0)));
  if (volume <= 0 || drc <= 0) return 0;
  return round2(volume * (drc / 100));
};

const applyLatexDerivedFields = (source = {}) => {
  const batch = source && typeof source.toObject === 'function' ? source.toObject() : { ...(source || {}) };
  const quantityEstimation = { ...(batch.quantityEstimation || {}) };
  const productYieldEstimation = { ...(batch.productYieldEstimation || {}) };
  const productRecommendation = { ...(batch.productRecommendation || {}) };
  const aiInsights = { ...(batch.aiInsights || {}) };

  const volume = toNumber(quantityEstimation.volume || quantityEstimation.weight, 0);
  const weight = toNumber(quantityEstimation.weight || quantityEstimation.volume, 0);
  const dryRubberContent = toNumber(productYieldEstimation.dryRubberContent, 0);
  const estimatedYield = toNumber(productYieldEstimation.estimatedYield, 0) > 0
    ? toNumber(productYieldEstimation.estimatedYield, 0)
    : computeEstimatedYieldKg(volume, dryRubberContent);

  return {
    ...batch,
    colorAnalysis: sanitizeColorAnalysis(batch.colorAnalysis),
    quantityEstimation: {
      ...quantityEstimation,
      volume,
      weight,
    },
    productYieldEstimation: {
      ...productYieldEstimation,
      dryRubberContent,
      estimatedYield,
    },
    productRecommendation: {
      ...productRecommendation,
      recommendedUses: normalizeRecommendedUses(productRecommendation.recommendedUses, 8),
    },
    aiInsights: {
      ...aiInsights,
      promptRecommendations: normalizeBulletList(aiInsights.promptRecommendations, 8),
      suggestions: normalizeBulletList(aiInsights.suggestions, 12),
    },
  };
};

const normalizeImpurity = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  if (['dirt', 'bark', 'leaves', 'water', 'chemicals', 'other'].includes(raw)) return raw;
  if (raw.includes('leaf')) return 'leaves';
  if (raw.includes('water')) return 'water';
  if (raw.includes('bark')) return 'bark';
  if (raw.includes('chem')) return 'chemicals';
  if (raw.includes('dirt') || raw.includes('soil') || raw.includes('dust')) return 'dirt';
  return 'other';
};

const syncLegacyLatexAnalysis = async (batchDoc) => {
  if (!batchDoc) return;
  const batch = typeof batchDoc.toObject === 'function' ? batchDoc.toObject() : batchDoc;
  const grade = batch?.qualityClassification?.grade;
  const qualityClass = qualityFromGrade(grade);
  const qualityScore = Number.isFinite(Number(batch?.qualityClassification?.confidence))
    ? Number(batch.qualityClassification.confidence)
    : qualityScoreFromGrade(grade);

  const impuritiesDetected = Array.isArray(batch?.contaminationDetection?.contaminantTypes)
    ? batch.contaminationDetection.contaminantTypes
        .map((item) => normalizeImpurity(item))
        .filter(Boolean)
    : [];

  await LatexAnalysis.findOneAndUpdate(
    { userId: batch.user, imagePublicId: batch.cloudinaryID },
    {
      userId: batch.user,
      imageUrl: batch.imageURL,
      imagePublicId: batch.cloudinaryID,
      region: 'global_avg',
      qualityClass,
      qualityScore: Math.max(0, Math.min(100, qualityScore || 0)),
      dryRubberContent: Math.max(0, Math.min(100, Number(batch?.productYieldEstimation?.dryRubberContent || 0))),
      contaminationDetected: Boolean(batch?.contaminationDetection?.hasContamination || batch?.contaminationDetection?.hasWater),
      colorScore: Math.max(0, Math.min(100, Number(batch?.qualityClassification?.confidence || 0))),
      consistencyScore: Math.max(0, Math.min(100, Number(batch?.quantityEstimation?.confidence || 0))),
      impuritiesDetected,
      quantityEstimate: Number(batch?.quantityEstimation?.weight || batch?.quantityEstimation?.volume || 0),
      recommendations: [
        ...normalizeLatexList(batch?.productRecommendation?.reason),
        ...normalizeLatexList(batch?.productRecommendation?.preservation),
        ...normalizeLatexList(batch?.aiInsights?.suggestions)
      ],
      marketPrice: {
        amount: Number(batch?.marketPriceEstimation?.totalEstimatedValue || 0),
        currency: batch?.marketPriceEstimation?.currency || 'PHP',
        region: 'global_avg'
      },
      fullAnalysis: batch,
      processingTime: 'N/A',
      mlModelUsed: true
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
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

    analysisResults.colorAnalysis = sanitizeColorAnalysis(analysisResults.colorAnalysis);
    analysisResults.aiInsights = {
      ...(analysisResults.aiInsights || {}),
      promptRecommendations: normalizeBulletList(analysisResults.aiInsights?.promptRecommendations, 8),
      suggestions: normalizeBulletList(analysisResults.aiInsights?.suggestions, 12),
    };
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
      drContent = !isNaN(userDRC) && userDRC > 0 ? userDRC : 33.0;
      volume = !isNaN(userVolume) && userVolume > 0 ? userVolume : 0;
      // Use defaults for failed analysis
      analysisResults.qualityClassification = {
        grade: 'F',
        confidence: 0,
        description: 'Analysis failed: ' + analysisResults.error
      };
      // Keep user inputs even if analysis fails
      analysisResults.productYieldEstimation = {
        dryRubberContent: drContent,
        estimatedYield: computeEstimatedYieldKg(
          volume,
          drContent
        ),
        productType: 'Unknown'
      };
      analysisResults.quantityEstimation = { 
          volume, 
          weight: volume, 
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
      analysisResults.productYieldEstimation.estimatedYield = computeEstimatedYieldKg(volume, drContent);
      
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

    try {
      await syncLegacyLatexAnalysis(latexBatch);
    } catch (syncErr) {
      console.error('Legacy latex analysis sync failed after batch create:', syncErr);
    }

    res.status(201).json({
      success: true,
      message: 'Latex batch created and analyzed successfully',
      data: applyLatexDerivedFields(latexBatch)
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

    analysisResults.colorAnalysis = sanitizeColorAnalysis(analysisResults.colorAnalysis);
    analysisResults.aiInsights = {
      ...(analysisResults.aiInsights || {}),
      promptRecommendations: normalizeBulletList(analysisResults.aiInsights?.promptRecommendations, 8),
      suggestions: normalizeBulletList(analysisResults.aiInsights?.suggestions, 12),
    };
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
    const estimatedYield = computeEstimatedYieldKg(volume, drContent);

    if (!analysisResults.productYieldEstimation) analysisResults.productYieldEstimation = {};
    analysisResults.productYieldEstimation.estimatedYield = estimatedYield;

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
    try {
      await syncLegacyLatexAnalysis(batch);
    } catch (syncErr) {
      console.error('Legacy latex analysis sync failed after re-analysis:', syncErr);
    }

    res.status(200).json({
      success: true,
      message: 'Latex batch re-analyzed successfully',
      data: applyLatexDerivedFields(batch)
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
    const sanitizedBatches = batches.map((item) => applyLatexDerivedFields(item));

    res.status(200).json({
      success: true,
      count: sanitizedBatches.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: sanitizedBatches
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
      data: applyLatexDerivedFields(batch)
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
