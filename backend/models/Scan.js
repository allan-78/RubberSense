// ============================================
// 📸 Scan Model - Image Scan Results
// ============================================

const mongoose = require('mongoose');

const scanSchema = new mongoose.Schema({
  tree: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tree',
    required: true,
    index: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  scanType: {
    type: String,
    enum: ['tree', 'latex'],
    required: true
  },
  // Image Information
  imageURL: {
    type: String,
    required: true
  },
  cloudinaryID: {
    type: String,
    required: true
  },
  // Tree Analysis Results
  treeIdentification: {
    isRubberTree: {
      type: Boolean,
      default: true
    },
    confidence: {
      type: Number,
      default: 0
    },
    maturity: String,
    detectedPart: String // 'trunk', 'leaf', 'whole_tree'
  },
  trunkAnalysis: {
    girth: Number,
    diameter: Number,
    texture: String,
    color: String,
    healthStatus: String, // 'healthy', 'diseased'
    damages: [String]
  },
  leafAnalysis: {
    healthStatus: String, // 'healthy', 'diseased'
    color: String,
    spotCount: Number,
    diseases: [{
      name: String,
      confidence: Number,
      severity: String
    }]
  },
  diseaseDetection: [{
    name: String,
    confidence: Number,
    severity: String,
    recommendation: String
  }],
  tappabilityAssessment: {
    isTappable: Boolean,
    score: Number,
    reason: String
  },
  latexQualityPrediction: {
    quality: {
      type: String,
      enum: ['excellent', 'good', 'fair', 'poor']
    },
    dryRubberContent: Number, // Percentage
    estimatedPrice: Number
  },
  latexColorAnalysis: {
    primaryColor: String,
    rgb: {
      r: Number,
      g: Number,
      b: Number
    },
    hex: String
  },
  contaminationDetection: {
    hasWater: Boolean,
    hasContamination: Boolean,
    contaminationLevel: String,
    contaminantTypes: [String]
  },
  quantityEstimation: {
    volume: Number,
    weight: Number,
    confidence: Number
  },
  productYieldEstimation: {
    dryRubberContent: Number,
    estimatedYield: Number,
    productType: String
  },
  latexFlowIntensity: {
    type: String,
    enum: ['low', 'medium', 'high', 'very_high']
  },
  productivityRecommendation: {
    status: String,
    suggestions: [String]
  },
  // Processing Status
  processingStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  processingTime: {
    type: Number, // In milliseconds
    default: null
  },
  errorMessage: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Scan', scanSchema);
