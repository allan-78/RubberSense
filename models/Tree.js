// ============================================
// 🌳 Tree Model - Rubber Tree Data
// ============================================

const mongoose = require('mongoose');

const treeSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  treeID: {
    type: String,
    required: true,
    unique: true
  },
  species: {
    type: String,
    default: 'Rubber'
  },
  isRubberTree: {
    type: Boolean,
    default: true
  },
  location: {
    latitude: Number,
    longitude: Number,
    address: String
  },
  plantedDate: {
    type: Date,
    default: null
  },
  age: {
    type: Number, // In years
    default: null
  },
  // Trunk Characteristics
  trunkGirth: {
    type: Number, // In centimeters
    default: null
  },
  trunkDiameter: {
    type: Number, // In centimeters
    default: null
  },
  barkTexture: {
    type: String,
    enum: ['smooth', 'rough', 'cracked', 'flaky', 'unknown'],
    default: 'unknown'
  },
  barkColor: {
    type: String,
    default: null
  },
  // Health Status
  healthStatus: {
    type: String,
    enum: ['healthy', 'diseased', 'dying', 'dead', 'unknown'],
    default: 'unknown'
  },
  diseaseDetected: [{
    name: String,
    severity: {
      type: String,
      enum: ['low', 'medium', 'high']
    },
    detectedAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Tappability & Productivity
  isTappable: {
    type: Boolean,
    default: false
  },
  tappabilityScore: {
    type: Number, // 0-100
    default: null
  },
  productivityStatus: {
    type: String,
    enum: ['low', 'medium', 'high', 'very_high', 'unknown'],
    default: 'unknown'
  },
  estimatedYield: {
    type: Number, // Kg per year
    default: null
  },
  // Latest Scan Info
  lastScannedAt: {
    type: Date,
    default: null
  },
  totalScans: {
    type: Number,
    default: 0
  },
  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Tree', treeSchema);
