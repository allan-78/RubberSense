const mongoose = require('mongoose');

const leafAnalysisSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  imageUrl: {
    type: String,
    required: [true, 'Image URL is required']
  },
  imagePublicId: {
    type: String,
    required: [true, 'Image public ID is required']
  },
  diseaseDetected: {
    type: String,
    required: [true, 'Disease detected is required'],
    default: 'Unknown',
    index: true
  },
  confidence: {
    type: Number,
    required: [true, 'Confidence score is required'],
    min: [0, 'Confidence cannot be below 0'],
    max: [100, 'Confidence cannot exceed 100'],
    default: 0
  },
  severity: {
    type: Number,
    min: [0, 'Severity cannot be below 0'],
    max: [100, 'Severity cannot exceed 100'],
    default: 0
  },
  severityLevel: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Critical', 'Unknown', 'Very Low'],
    default: 'Unknown'
  },
  spotsCount: {
    type: Number,
    min: 0,
    default: 0
  },
  colorAnalysis: {
    primaryColor: { type: String, default: 'unknown' },
    discoloration: { type: Number, default: 0 },
    healthyGreenPercentage: { type: Number, default: 0 },
    affectedAreaPercentage: { type: Number, default: 0 }
  },
  treatmentRecommendations: [{
    type: String
  }],
  preventionStrategies: [{
    type: String
  }],
  fullAnalysis: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  processingTime: {
    type: String,
    default: 'N/A'
  },
  mlModelUsed: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
leafAnalysisSchema.index({ userId: 1, createdAt: -1 });
leafAnalysisSchema.index({ diseaseDetected: 1, createdAt: -1 });
leafAnalysisSchema.index({ severity: 1 });

// Virtual for formatted date
leafAnalysisSchema.virtual('formattedDate').get(function() {
  return this.createdAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
});

// Virtual for severity description
leafAnalysisSchema.virtual('severityDescription').get(function() {
  if (this.severity >= 80) return 'Critical - Immediate action required';
  if (this.severity >= 60) return 'High - Treatment needed soon';
  if (this.severity >= 40) return 'Medium - Monitor closely';
  if (this.severity >= 20) return 'Low - Minimal concern';
  return 'Very Low - Healthy';
});

// Method to check if treatment is urgent
leafAnalysisSchema.methods.isUrgent = function() {
  return this.severity >= 70;
};

// Method to get quick summary
leafAnalysisSchema.methods.getSummary = function() {
  return {
    disease: this.diseaseDetected,
    severity: `${this.severity}% - ${this.severityLevel}`,
    confidence: `${this.confidence}%`,
    spotsFound: this.spotsCount,
    date: this.formattedDate
  };
};

module.exports = mongoose.model('LeafAnalysis', leafAnalysisSchema);