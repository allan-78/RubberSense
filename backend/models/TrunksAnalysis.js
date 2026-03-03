const mongoose = require('mongoose');

const trunkAnalysisSchema = new mongoose.Schema({
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
  primaryDetection: {
    class: {
      type: String,
      required: true,
      index: true
    },
    name: String,
    display_name: String,
    confidence: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical', 'none', 'mild', 'moderate', 'severe', 
             'mild to moderate', 'moderate to severe', 'Mild to Moderate', 'Moderate to Severe']
    }
  },
  allDetections: [{
    class: String,
    name: String,
    display_name: String,
    confidence: Number,
    bbox: [Number],
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical', 'none', 'mild', 'moderate', 'severe',
             'mild to moderate', 'moderate to severe', 'Mild to Moderate', 'Moderate to Severe']
    }
  }],
  maturity: {
    class: {
      type: String,
      enum: ['immature', 'mature', 'unknown']
    },
    confidence: Number,
    estimatedAge: {
      min: Number,
      max: Number,
      unit: {
        type: String,
        default: 'years'
      }
    }
  },
  colorAnalysis: {
    primaryColor: String,
    barkCondition: {
      type: String,
      enum: ['healthy', 'rough', 'cracked', 'peeling', 'unknown']
    },
    discoloration: Number
  },
  textureAnalysis: {
    smoothness: Number,
    roughness: Number,
    pattern: String
  },
  healthScore: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    index: true
  },
  ageEstimate: {
    type: Number,
    min: 0,
    max: 100
  },
  careRecommendations: [{
    priority: {
      type: String,
      enum: ['immediate', 'soon', 'monitor', 'routine']
    },
    action: String,
    description: String,
    timeframe: String
  }],
  fullAnalysis: {
    type: mongoose.Schema.Types.Mixed
  },
  processingTime: String,
  mlModelUsed: {
    type: Boolean,
    default: true
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
trunkAnalysisSchema.index({ userId: 1, createdAt: -1 });
trunkAnalysisSchema.index({ 'primaryDetection.class': 1, createdAt: -1 });
trunkAnalysisSchema.index({ healthScore: -1 });
trunkAnalysisSchema.index({ 'maturity.class': 1 });

// Virtual for formatted date
trunkAnalysisSchema.virtual('formattedDate').get(function() {
  return this.createdAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
});

// Virtual for health status
trunkAnalysisSchema.virtual('healthStatus').get(function() {
  if (this.healthScore >= 80) return 'Excellent';
  if (this.healthScore >= 60) return 'Good';
  if (this.healthScore >= 40) return 'Fair';
  if (this.healthScore >= 20) return 'Poor';
  return 'Critical';
});

// Virtual for priority level
trunkAnalysisSchema.virtual('priority').get(function() {
  if (this.healthScore <= 30) return 'high';
  if (this.healthScore <= 50) return 'medium';
  return 'low';
});

// Method to check if tree needs immediate attention
trunkAnalysisSchema.methods.needsImmediateAttention = function() {
  return this.healthScore <= 30 || 
         (this.primaryDetection && this.primaryDetection.severity === 'critical');
};

// Method to get urgent recommendations
trunkAnalysisSchema.methods.getUrgentRecommendations = function() {
  return this.careRecommendations.filter(rec => rec.priority === 'immediate');
};

// Method to check if tree is mature
trunkAnalysisSchema.methods.isMature = function() {
  return this.maturity.class === 'mature';
};

module.exports = mongoose.model('TrunksAnalysis', trunkAnalysisSchema);