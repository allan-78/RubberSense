const mongoose = require('mongoose');

const MarketDataSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now,
  },
  // Original quote timestamp from provider (can differ from record creation time).
  sourceTimestamp: {
    type: Date,
  },
  source: {
    type: String,
    default: 'stooq',
  },
  sourceSymbol: {
    type: String,
  },
  sourcePrice: {
    type: Number,
  },
  sourceCurrency: {
    type: String,
  },
  sourceUnit: {
    type: String,
  },
  fxRate: {
    type: Number,
  },
  price: {
    type: Number,
    required: true,
  },
  currency: {
    type: String,
    default: 'PHP',
  },
  unit: {
    type: String,
    default: 'kg',
  },
  trend: {
    type: String, // "RISE", "FALL", "NEUTRAL"
    default: 'NEUTRAL',
  },
  priceChange: {
    type: Number, // Percentage change
    default: 0,
  },
  analysis: {
    type: String, // AI Analysis text
  },
  recommendations: [
    {
      type: String,
    }
  ],
  features: [
    {
      name: String,
      impact: String, // High, Medium, Low
      sentiment: String, // Positive, Negative, Neutral
    }
  ],
  nextWeekProjection: {
    type: Number,
  },
  confidence: {
    type: Number,
  }
});

module.exports = mongoose.model('MarketData', MarketDataSchema);
