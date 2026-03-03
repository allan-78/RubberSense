const express = require('express');

const router = express.Router();

const { protect } = require('../middleware/auth');
const Scan = require('../models/Scan');
const LatexBatch = require('../models/LatexBatch');

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const parsePagination = (query = {}) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = clamp(parseInt(query.limit, 10) || 20, 1, 200);
  return { page, limit };
};

const parseDateRange = (query = {}) => {
  const range = {};
  if (query.startDate) {
    const start = new Date(query.startDate);
    if (!Number.isNaN(start.getTime())) {
      range.$gte = start;
    }
  }
  if (query.endDate) {
    const end = new Date(query.endDate);
    if (!Number.isNaN(end.getTime())) {
      end.setHours(23, 59, 59, 999);
      range.$lte = end;
    }
  }
  return Object.keys(range).length ? range : null;
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toText = (value) => {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (Array.isArray(value)) {
    return value.map((item) => toText(item)).filter(Boolean).join(' ').trim();
  }
  if (typeof value === 'object') {
    return Object.values(value).map((item) => toText(item)).filter(Boolean).join(' ').trim();
  }
  return '';
};

const toTextList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => toText(item)).filter(Boolean);
  }
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, val]) => `${key}: ${toText(val)}`.trim())
      .filter(Boolean);
  }

  const raw = toText(value);
  if (!raw) return [];
  return raw
    .split(/\n|;\s+/)
    .map((line) => line.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean);
};

const uniqueList = (items = []) => Array.from(new Set(items.filter(Boolean)));

const severityToText = (value) => {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return 'unknown';
  if (['none', 'healthy', 'no disease'].includes(text)) return 'none';
  if (['low', 'mild'].includes(text)) return 'low';
  if (['moderate', 'medium'].includes(text)) return 'moderate';
  if (['high', 'severe'].includes(text)) return 'high';
  if (text === 'critical') return 'critical';
  return text;
};

const severityToScore = (value) => {
  const normalized = severityToText(value);
  if (normalized === 'none') return 0;
  if (normalized === 'low') return 3;
  if (normalized === 'moderate') return 6;
  if (normalized === 'high') return 8;
  if (normalized === 'critical') return 10;
  return 0;
};

const looksHealthy = (name, severity, healthStatus, aiDiagnosis) => {
  const lowerName = String(name || '').toLowerCase();
  const lowerHealth = String(healthStatus || '').toLowerCase();
  const lowerAi = toText(aiDiagnosis).toLowerCase();

  if (severityToText(severity) === 'none') return true;
  if (/healthy|no disease|disease[-\s]?free/.test(lowerName)) return true;
  if (lowerHealth === 'healthy') return true;
  if (
    /no\s+(signs?|evidence)\s+of\s+(disease|infection)|no disease detected|tree is healthy|appears healthy/.test(lowerAi)
  ) {
    return true;
  }
  return false;
};

const classToSlug = (value) => {
  const raw = String(value || 'unknown')
    .trim()
    .toLowerCase();

  if (!raw) return 'unknown';
  return raw.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
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

const deriveHealthScore = (scan, primaryDisease, healthy) => {
  const tappabilityScore = toNumber(scan?.tappabilityAssessment?.score, NaN);
  if (Number.isFinite(tappabilityScore)) {
    return clamp(tappabilityScore, 0, 100);
  }

  if (healthy) return 90;

  const severity = severityToText(primaryDisease?.severity);
  if (severity === 'critical') return 20;
  if (severity === 'high') return 35;
  if (severity === 'moderate') return 55;
  if (severity === 'low') return 70;
  return 60;
};

const maturityToAge = (maturity) => {
  const text = String(maturity || '').toLowerCase();
  if (text === 'immature') return 5;
  if (text === 'mature') return 15;
  return null;
};

const mapLeafFromScan = (scan) => {
  const primaryDisease = scan?.diseaseDetection?.[0] || {};
  const fallbackLeafDisease = scan?.leafAnalysis?.diseases?.[0] || {};
  const rawName = primaryDisease.name || fallbackLeafDisease.name || 'Unknown';
  const rawSeverity = primaryDisease.severity || fallbackLeafDisease.severity || 'unknown';
  const healthy = looksHealthy(rawName, rawSeverity, scan?.leafAnalysis?.healthStatus, primaryDisease?.ai_diagnosis);

  const diseaseDetected = healthy ? 'Healthy' : String(rawName || 'Unknown');
  const confidence = clamp(
    toNumber(
      primaryDisease.confidence
      ?? fallbackLeafDisease.confidence
      ?? scan?.treeIdentification?.confidence,
      0
    ),
    0,
    100
  );
  const severity = healthy ? 0 : severityToScore(rawSeverity);
  const spotsCount = Math.max(toNumber(scan?.leafAnalysis?.spotCount, 0), 0);

  const treatmentRecommendations = uniqueList([
    ...toTextList(primaryDisease.recommendation),
    ...toTextList(primaryDisease.treatment),
    ...toTextList(primaryDisease.prevention),
    ...toTextList(primaryDisease?.ai_diagnosis?.treatment),
    ...toTextList(primaryDisease?.ai_diagnosis?.prevention)
  ]);

  return {
    _id: String(scan._id),
    scanId: String(scan._id),
    imageUrl: scan.imageURL || scan.imageUrl || null,
    imagePublicId: scan.cloudinaryID || null,
    diseaseDetected,
    confidence,
    severity,
    severityLevel: severityToText(rawSeverity),
    spotsCount,
    colorAnalysis: {
      primaryColor: scan?.leafAnalysis?.color || 'unknown'
    },
    treatmentRecommendations,
    fullAnalysis: scan,
    createdAt: scan.createdAt,
    updatedAt: scan.updatedAt
  };
};

const mapTrunkFromScan = (scan) => {
  const primaryDisease = scan?.diseaseDetection?.[0] || {};
  const diseaseName = String(primaryDisease.name || 'Unknown');
  const healthy = looksHealthy(
    diseaseName,
    primaryDisease.severity,
    scan?.trunkAnalysis?.healthStatus,
    primaryDisease?.ai_diagnosis
  );
  const detectionClass = healthy ? 'healthy' : classToSlug(diseaseName);
  const confidence = clamp(
    toNumber(primaryDisease.confidence ?? scan?.treeIdentification?.confidence, 0),
    0,
    100
  );
  const healthScore = deriveHealthScore(scan, primaryDisease, healthy);
  const maturityClass = String(scan?.treeIdentification?.maturity || 'unknown');
  const ageEstimate = maturityToAge(maturityClass);

  const recommendations = uniqueList([
    ...toTextList(primaryDisease.recommendation),
    ...(Array.isArray(scan?.productivityRecommendation?.suggestions)
      ? scan.productivityRecommendation.suggestions.map((item) => toText(item)).filter(Boolean)
      : []),
    ...toTextList(primaryDisease?.ai_diagnosis?.treatment),
    ...toTextList(primaryDisease?.ai_diagnosis?.prevention)
  ]);

  return {
    _id: String(scan._id),
    scanId: String(scan._id),
    imageUrl: scan.imageURL || scan.imageUrl || null,
    imagePublicId: scan.cloudinaryID || null,
    primaryDetection: {
      class: detectionClass,
      name: diseaseName,
      display_name: healthy ? 'Healthy' : diseaseName,
      confidence,
      severity: severityToText(primaryDisease.severity)
    },
    allDetections: (scan?.diseaseDetection || []).map((disease) => ({
      class: classToSlug(disease?.name),
      name: disease?.name || 'Unknown',
      display_name: disease?.name || 'Unknown',
      confidence: clamp(toNumber(disease?.confidence, 0), 0, 100),
      severity: severityToText(disease?.severity)
    })),
    maturity: {
      class: maturityClass ? maturityClass.charAt(0).toUpperCase() + maturityClass.slice(1) : 'Unknown',
      confidence: clamp(toNumber(scan?.treeIdentification?.confidence, 0), 0, 100)
    },
    healthScore,
    ageEstimate,
    colorAnalysis: {
      primaryColor: scan?.trunkAnalysis?.color || 'unknown',
      barkCondition: scan?.trunkAnalysis?.texture || 'unknown'
    },
    careRecommendations: recommendations.map((action) => ({
      priority: healthScore < 40 ? 'immediate' : healthScore < 65 ? 'soon' : 'routine',
      action,
      description: action,
      timeframe: healthScore < 40 ? 'Immediately' : healthScore < 65 ? 'Within 7 days' : 'Routine monitoring'
    })),
    fullAnalysis: scan,
    createdAt: scan.createdAt,
    updatedAt: scan.updatedAt
  };
};

const mapLatexFromBatch = (batch) => {
  const grade = batch?.qualityClassification?.grade;
  const qualityClass = qualityFromGrade(grade);
  const qualityScore = clamp(
    toNumber(batch?.qualityClassification?.confidence, qualityScoreFromGrade(grade)),
    0,
    100
  );
  const dryRubberContent = clamp(toNumber(batch?.productYieldEstimation?.dryRubberContent, 0), 0, 100);
  const contaminationDetected = Boolean(
    batch?.contaminationDetection?.hasContamination || batch?.contaminationDetection?.hasWater
  );

  return {
    _id: String(batch._id),
    imageUrl: batch.imageURL || null,
    imagePublicId: batch.cloudinaryID || null,
    qualityClass,
    qualityScore,
    dryRubberContent,
    contaminationDetected,
    colorScore: clamp(toNumber(batch?.qualityClassification?.confidence, 0), 0, 100),
    consistencyScore: clamp(toNumber(batch?.quantityEstimation?.confidence, 0), 0, 100),
    impuritiesDetected: batch?.contaminationDetection?.contaminantTypes || [],
    fullAnalysis: batch,
    createdAt: batch.createdAt,
    updatedAt: batch.updatedAt
  };
};

const sortItems = (items, sortBy, order) => {
  const direction = order === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    const left = a?.[sortBy];
    const right = b?.[sortBy];
    if (left == null && right == null) return 0;
    if (left == null) return 1;
    if (right == null) return -1;

    if (typeof left === 'number' && typeof right === 'number') {
      return (left - right) * direction;
    }
    if (left instanceof Date || right instanceof Date) {
      return (new Date(left).getTime() - new Date(right).getTime()) * direction;
    }
    return String(left).localeCompare(String(right)) * direction;
  });
};

const paginate = (items, page, limit) => {
  const total = items.length;
  const start = (page - 1) * limit;
  const data = items.slice(start, start + limit);
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(Math.ceil(total / limit), 1)
    }
  };
};

const leafBaseFilter = (userId, dateRange) => {
  const filter = {
    user: userId,
    scanType: 'tree',
    $or: [
      { 'treeIdentification.detectedPart': 'leaf' },
      { leafAnalysis: { $exists: true, $ne: null } }
    ]
  };
  if (dateRange) filter.createdAt = dateRange;
  return filter;
};

const trunkBaseFilter = (userId, dateRange) => {
  const filter = {
    user: userId,
    scanType: 'tree',
    $or: [
      { 'treeIdentification.detectedPart': 'trunk' },
      { 'treeIdentification.detectedPart': 'whole_tree' },
      { trunkAnalysis: { $exists: true, $ne: null } }
    ]
  };
  if (dateRange) filter.createdAt = dateRange;
  return filter;
};

const latexBaseFilter = (userId, dateRange) => {
  const filter = { user: userId };
  if (dateRange) filter.createdAt = dateRange;
  return filter;
};

router.get('/leaf/history', protect, async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const sortBy = req.query.sortBy || 'createdAt';
    const order = req.query.order === 'asc' ? 'asc' : 'desc';
    const dateRange = parseDateRange(req.query);

    const scans = await Scan.find(leafBaseFilter(req.user.id, dateRange))
      .sort({ createdAt: -1 })
      .lean();

    let mapped = scans.map(mapLeafFromScan);

    if (req.query.disease) {
      const diseaseFilter = String(req.query.disease).toLowerCase();
      mapped = mapped.filter((row) => String(row.diseaseDetected || '').toLowerCase().includes(diseaseFilter));
    }

    if (req.query.severity) {
      const severityFilter = String(req.query.severity).toLowerCase();
      mapped = mapped.filter((row) => String(row.severityLevel || '').toLowerCase() === severityFilter);
    }

    mapped = sortItems(mapped, sortBy, order);
    const result = paginate(mapped, page, limit);

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch leaf history' });
  }
});

router.get('/leaf/stats', protect, async (req, res) => {
  try {
    const scans = await Scan.find(leafBaseFilter(req.user.id, null)).lean();
    const mapped = scans.map(mapLeafFromScan);
    const totalAnalyses = mapped.length;

    const safeAverage = (sum) => (totalAnalyses ? sum / totalAnalyses : 0);
    const avgConfidence = safeAverage(mapped.reduce((acc, row) => acc + toNumber(row.confidence, 0), 0));
    const avgSeverity = safeAverage(mapped.reduce((acc, row) => acc + toNumber(row.severity, 0), 0));
    const avgSpotsCount = safeAverage(mapped.reduce((acc, row) => acc + toNumber(row.spotsCount, 0), 0));

    res.json({
      success: true,
      data: {
        summary: {
          totalAnalyses,
          avgConfidence,
          avgSeverity,
          avgSpotsCount
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch leaf stats' });
  }
});

router.get('/leaf/analysis/:id', protect, async (req, res) => {
  try {
    const scan = await Scan.findOne({
      _id: req.params.id,
      ...leafBaseFilter(req.user.id, null)
    }).lean();

    if (!scan) {
      return res.status(404).json({ success: false, error: 'Leaf analysis not found' });
    }

    res.json({ success: true, data: mapLeafFromScan(scan) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch leaf analysis' });
  }
});

router.delete('/leaf/history/:id', protect, async (req, res) => {
  try {
    const deleted = await Scan.findOneAndDelete({
      _id: req.params.id,
      ...leafBaseFilter(req.user.id, null)
    });

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Leaf analysis not found' });
    }

    res.json({ success: true, message: 'Leaf analysis deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to delete leaf analysis' });
  }
});

router.delete('/leaf/history/batch', protect, async (req, res) => {
  try {
    const analysisIds = Array.isArray(req.body?.analysisIds) ? req.body.analysisIds : [];
    if (!analysisIds.length) {
      return res.status(400).json({ success: false, error: 'analysisIds is required' });
    }

    const result = await Scan.deleteMany({
      _id: { $in: analysisIds },
      ...leafBaseFilter(req.user.id, null)
    });

    res.json({
      success: true,
      deletedCount: result.deletedCount || 0
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to batch delete leaf analyses' });
  }
});

router.get('/trunks/history', protect, async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const sortBy = req.query.sortBy || 'createdAt';
    const order = req.query.order === 'asc' ? 'asc' : 'desc';
    const dateRange = parseDateRange(req.query);

    const scans = await Scan.find(trunkBaseFilter(req.user.id, dateRange))
      .sort({ createdAt: -1 })
      .lean();

    let mapped = scans.map(mapTrunkFromScan);

    if (req.query.disease) {
      const diseaseFilter = String(req.query.disease).toLowerCase();
      mapped = mapped.filter((row) =>
        String(row.primaryDetection?.display_name || row.primaryDetection?.class || '').toLowerCase().includes(diseaseFilter)
      );
    }

    if (req.query.maturity) {
      const maturityFilter = String(req.query.maturity).toLowerCase();
      mapped = mapped.filter((row) => String(row.maturity?.class || '').toLowerCase() === maturityFilter);
    }

    if (req.query.minHealthScore) {
      const minHealthScore = toNumber(req.query.minHealthScore, 0);
      mapped = mapped.filter((row) => toNumber(row.healthScore, 0) >= minHealthScore);
    }

    mapped = sortItems(mapped, sortBy, order);
    const result = paginate(mapped, page, limit);

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch trunk history' });
  }
});

router.get('/trunks/stats', protect, async (req, res) => {
  try {
    const scans = await Scan.find(trunkBaseFilter(req.user.id, null)).lean();
    const mapped = scans.map(mapTrunkFromScan);
    const totalAnalyses = mapped.length;

    const safeAverage = (sum) => (totalAnalyses ? sum / totalAnalyses : 0);
    const avgHealthScore = safeAverage(mapped.reduce((acc, row) => acc + toNumber(row.healthScore, 0), 0));
    const avgConfidence = safeAverage(mapped.reduce((acc, row) => acc + toNumber(row.primaryDetection?.confidence, 0), 0));
    const avgAgeEstimate = safeAverage(mapped.reduce((acc, row) => acc + toNumber(row.ageEstimate, 0), 0));

    res.json({
      success: true,
      data: {
        summary: {
          totalAnalyses,
          avgHealthScore,
          avgConfidence,
          avgAgeEstimate
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch trunk stats' });
  }
});

router.get('/trunks/analysis/:id', protect, async (req, res) => {
  try {
    const scan = await Scan.findOne({
      _id: req.params.id,
      ...trunkBaseFilter(req.user.id, null)
    }).lean();

    if (!scan) {
      return res.status(404).json({ success: false, error: 'Trunk analysis not found' });
    }

    res.json({ success: true, data: mapTrunkFromScan(scan) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch trunk analysis' });
  }
});

router.delete('/trunks/analysis/:id', protect, async (req, res) => {
  try {
    const deleted = await Scan.findOneAndDelete({
      _id: req.params.id,
      ...trunkBaseFilter(req.user.id, null)
    });

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Trunk analysis not found' });
    }

    res.json({ success: true, message: 'Trunk analysis deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to delete trunk analysis' });
  }
});

router.delete('/trunks/history/batch', protect, async (req, res) => {
  try {
    const analysisIds = Array.isArray(req.body?.analysisIds) ? req.body.analysisIds : [];
    if (!analysisIds.length) {
      return res.status(400).json({ success: false, error: 'analysisIds is required' });
    }

    const result = await Scan.deleteMany({
      _id: { $in: analysisIds },
      ...trunkBaseFilter(req.user.id, null)
    });

    res.json({
      success: true,
      deletedCount: result.deletedCount || 0
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to batch delete trunk analyses' });
  }
});

router.get('/latex/history', protect, async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const dateRange = parseDateRange(req.query);

    const batches = await LatexBatch.find(latexBaseFilter(req.user.id, dateRange))
      .sort({ createdAt: -1 })
      .lean();

    let mapped = batches.map(mapLatexFromBatch);

    if (req.query.qualityClass) {
      const qualityFilter = String(req.query.qualityClass).toLowerCase();
      mapped = mapped.filter((row) => String(row.qualityClass || '').toLowerCase() === qualityFilter);
    }

    const result = paginate(mapped, page, limit);

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch latex history' });
  }
});

router.get('/latex/stats', protect, async (req, res) => {
  try {
    const batches = await LatexBatch.find(latexBaseFilter(req.user.id, null)).lean();
    const mapped = batches.map(mapLatexFromBatch);
    const totalAnalyses = mapped.length;

    const safeAverage = (sum) => (totalAnalyses ? sum / totalAnalyses : 0);
    const avgQualityScore = safeAverage(mapped.reduce((acc, row) => acc + toNumber(row.qualityScore, 0), 0));
    const avgDryRubberContent = safeAverage(mapped.reduce((acc, row) => acc + toNumber(row.dryRubberContent, 0), 0));
    const totalContaminationDetected = mapped.filter((row) => row.contaminationDetected).length;

    res.json({
      success: true,
      data: {
        summary: {
          totalAnalyses,
          avgQualityScore,
          avgDryRubberContent,
          totalContaminationDetected
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch latex stats' });
  }
});

router.get('/latex/analysis/:id', protect, async (req, res) => {
  try {
    const batch = await LatexBatch.findOne({
      _id: req.params.id,
      ...latexBaseFilter(req.user.id, null)
    }).lean();

    if (!batch) {
      return res.status(404).json({ success: false, error: 'Latex analysis not found' });
    }

    res.json({ success: true, data: mapLatexFromBatch(batch) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch latex analysis' });
  }
});

router.delete('/latex/history/:id', protect, async (req, res) => {
  try {
    const deleted = await LatexBatch.findOneAndDelete({
      _id: req.params.id,
      ...latexBaseFilter(req.user.id, null)
    });

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Latex analysis not found' });
    }

    res.json({ success: true, message: 'Latex analysis deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to delete latex analysis' });
  }
});

router.delete('/latex/history/batch', protect, async (req, res) => {
  try {
    const analysisIds = Array.isArray(req.body?.analysisIds) ? req.body.analysisIds : [];
    if (!analysisIds.length) {
      return res.status(400).json({ success: false, error: 'analysisIds is required' });
    }

    const result = await LatexBatch.deleteMany({
      _id: { $in: analysisIds },
      ...latexBaseFilter(req.user.id, null)
    });

    res.json({
      success: true,
      deletedCount: result.deletedCount || 0
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to batch delete latex analyses' });
  }
});

module.exports = router;

