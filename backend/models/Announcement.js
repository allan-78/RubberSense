// RubberSense/backend/models/Announcement.js
const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  content: {
    type: String,
    required: [true, 'Content is required'],
    maxlength: [5000, 'Content cannot exceed 5000 characters']
  },
  type: {
    type: String,
    enum: ['announcement', 'update', 'maintenance', 'news', 'alert'],
    default: 'announcement'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  isPublished: {
    type: Boolean,
    default: true
  },
  publishDate: {
    type: Date,
    default: Date.now
  },
  expiryDate: {
    type: Date
  },
  targetAudience: {
    type: [String],
    enum: ['all', 'users', 'admins', 'premium', 'free'],
    default: ['all']
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  attachments: [{
    filename: String,
    originalName: String,
    mimeType: String,
    size: Number,
    url: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  views: {
    type: Number,
    default: 0
  },
  isImportant: {
    type: Boolean,
    default: false
  },
  // NEW: Track which users have read this announcement
  readBy: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  // NEW: Track which users have viewed this announcement
  viewedBy: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    viewedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Indexes for faster queries
announcementSchema.index({ isPublished: 1, publishDate: -1 });
announcementSchema.index({ type: 1, publishDate: -1 });
announcementSchema.index({ priority: 1 });
announcementSchema.index({ expiryDate: 1 });
announcementSchema.index({ 'targetAudience': 1 });
// NEW: Index for readBy queries
announcementSchema.index({ 'readBy.userId': 1 });

// Virtual for checking if announcement is expired
announcementSchema.virtual('isExpired').get(function() {
  if (!this.expiryDate) return false;
  return new Date() > this.expiryDate;
});

// Virtual for checking if announcement is active
announcementSchema.virtual('isActive').get(function() {
  if (!this.isPublished) return false;
  if (this.isExpired) return false;
  return true;
});

// NEW: Virtual for checking if a specific user has read this announcement
announcementSchema.methods.hasUserRead = function(userId) {
  return this.readBy.some(read => read.userId.toString() === userId.toString());
};

// NEW: Virtual for checking if a specific user has viewed this announcement
announcementSchema.methods.hasUserViewed = function(userId) {
  return this.viewedBy.some(view => view.userId.toString() === userId.toString());
};

module.exports = mongoose.model('Announcement', announcementSchema);