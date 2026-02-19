// ============================================
// 🥛 LatexBatch Model - Latex Quality Data
// ============================================

const mongoose = require('mongoose');

const latexBatchSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  batchID: {
    type: String,
    required: true,
    unique: true
  },
  collectionDate: {
    type: Date,
    default: Date.now
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
  // Latex Analysis Results
  colorAnalysis: {
    primaryColor: String,
    rgb: {
      r: Number,
      g: Number,
      b: Number
    },
    hex: String
  },
  qualityClassification: {
    grade: {
      type: String,
      enum: ['A', 'B', 'C', 'D', 'F']
    },
    confidence: Number,
    description: String
  },
  contaminationDetection: {
    hasWater: Boolean,
    hasContamination: Boolean,
    contaminationLevel: {
      type: String,
      enum: ['none', 'low', 'medium', 'high']
    },
    contaminantTypes: [String]
  },
  quantityEstimation: {
    volume: Number, // In liters
    weight: Number, // In kilograms
    confidence: Number
  },
  productYieldEstimation: {
    dryRubberContent: Number, // Percentage
    estimatedYield: Number, // Kg of dry rubber
    productType: String, // TSR20, RSS, etc.
    confidence: Number // Add confidence score
  },
  productRecommendation: {
    recommendedProduct: String,
    reason: String,
    expectedQuality: String
  },
  marketPriceEstimation: {
    pricePerKg: Number,
    totalEstimatedValue: Number,
    currency: {
      type: String,
      default: 'PHP'
    },
    priceDate: Date,
    marketTrend: String
  },
  // Processing Status
  processingStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  aiInsights: {
    promptRecommendations: [String],
    suggestions: [String],
    analysisTimestamp: Date,
    version: Number
  },
  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('LatexBatch', latexBatchSchema);
