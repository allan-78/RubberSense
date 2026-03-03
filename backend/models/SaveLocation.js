const mongoose = require('mongoose');

const saveLocationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Location name is required'],
    trim: true,
    maxlength: [100, 'Location name cannot exceed 100 characters']
  },
  type: {
    type: String,
    enum: ['plantation', 'collection'],
    default: 'plantation'
  },
  latitude: {
    type: Number,
    required: [true, 'Latitude is required'],
    min: [-90, 'Latitude must be between -90 and 90'],
    max: [90, 'Latitude must be between -90 and 90']
  },
  longitude: {
    type: Number,
    required: [true, 'Longitude is required'],
    min: [-180, 'Longitude must be between -180 and 180'],
    max: [180, 'Longitude must be between -180 and 180']
  },
  address: {
    type: String,
    required: [true, 'Address is required'],
    trim: true
  },
  details: {
    type: Object,
    default: {}
  },
  accuracy: {
    type: Number,
    default: null,
    min: [0, 'Accuracy cannot be negative']
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true  // Add index for faster user-based queries
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field on save
saveLocationSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Compound index for user + coordinates (prevents exact duplicate coordinates for same user)
saveLocationSchema.index({ user: 1, latitude: 1, longitude: 1 }, { unique: true });

// Index for faster queries by user
saveLocationSchema.index({ user: 1, createdAt: -1 });

// Method to get location coordinates as array
saveLocationSchema.methods.getCoordinates = function() {
  return [this.longitude, this.latitude];
};

// Method to check if location belongs to a user
saveLocationSchema.methods.belongsToUser = function(userId) {
  return this.user.toString() === userId.toString();
};

const SaveLocation = mongoose.model('SaveLocation', saveLocationSchema);

module.exports = SaveLocation;