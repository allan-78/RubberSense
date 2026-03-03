const mongoose = require('mongoose');

const latexAnalysisSchema = new mongoose.Schema({
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
  region: {
    type: String,
    default: 'global_avg',
    enum: ['thailand', 'indonesia', 'malaysia', 'vietnam', 'india', 'global_avg']
  },
  qualityClass: {
    type: String,
    enum: ['High', 'Medium', 'Low', 'Unknown'],
    index: true
  },
  qualityScore: {
    type: Number,
    min: [0, 'Quality score cannot be below 0'],
    max: [100, 'Quality score cannot exceed 100']
  },
  dryRubberContent: {
    type: Number,
    min: [0, 'DRC cannot be below 0'],
    max: [100, 'DRC cannot exceed 100']
  },
  contaminationDetected: {
    type: Boolean,
    default: false
  },
  colorScore: {
    type: Number,
    min: 0,
    max: 100
  },
  consistencyScore: {
    type: Number,
    min: 0,
    max: 100
  },
  impuritiesDetected: [{
    type: String,
    enum: ['dirt', 'bark', 'leaves', 'water', 'chemicals', 'other']
  }],
  quantityEstimate: {
    type: Number,
    min: 0
  },
  recommendations: [{
    type: String
  }],
  marketPrice: {
    amount: {
      type: Number,
      min: 0
    },
    currency: {
      type: String,
      default: 'PHP'
    },
    region: String
  },
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
latexAnalysisSchema.index({ userId: 1, createdAt: -1 });
latexAnalysisSchema.index({ qualityClass: 1, createdAt: -1 });
latexAnalysisSchema.index({ 'marketPrice.region': 1 });

// Virtual for formatted date
latexAnalysisSchema.virtual('formattedDate').get(function() {
  return this.createdAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
});

// Virtual for confidence level text
latexAnalysisSchema.virtual('confidenceLevel').get(function() {
  if (this.qualityScore >= 80) return 'Very High';
  if (this.qualityScore >= 60) return 'High';
  if (this.qualityScore >= 40) return 'Medium';
  if (this.qualityScore >= 20) return 'Low';
  return 'Very Low';
});

// Method to check if analysis is recent (within last 7 days)
latexAnalysisSchema.methods.isRecent = function() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  return this.createdAt > sevenDaysAgo;
};

module.exports = mongoose.model('LatexAnalysis', latexAnalysisSchema);