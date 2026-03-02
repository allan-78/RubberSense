// RubberSense/backend/models/Contact.js
const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    trim: true,
    lowercase: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email']
  },
  subject: {
    type: String,
    required: [true, 'Subject is required'],
    trim: true,
    maxlength: [200, 'Subject cannot exceed 200 characters']
  },
  message: {
    type: String,
    required: [true, 'Message is required'],
    trim: true,
    maxlength: [5000, 'Message cannot exceed 5000 characters']
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  status: {
    type: String,
    enum: ['unread', 'read', 'replied', 'archived', 'conversation'],
    default: 'unread'
  },
  userIP: {
    type: String
  },
  reply: {
    type: String,
    maxlength: [5000, 'Reply cannot exceed 5000 characters']
  },
  repliedAt: {
    type: Date
  },
  repliedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // New fields for user replies functionality
  userReplies: [{
    text: {
      type: String,
      required: true,
      maxlength: [5000, 'Reply cannot exceed 5000 characters']
    },
    date: {
      type: Date,
      default: Date.now
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    adminReplies: [{
      text: {
        type: String,
        required: true,
        maxlength: [5000, 'Reply cannot exceed 5000 characters']
      },
      date: {
        type: Date,
        default: Date.now
      },
      adminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      // NEW: Track if user has read this specific admin reply
      readByUser: {
        type: Boolean,
        default: false
      },
      readByUserAt: {
        type: Date
      }
    }],
    // NEW: Track when user last saw this reply thread.
    lastSeenByUser: {
      type: Date
    }
  }],
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date
  },
  // NEW: Track if user has read the main admin reply
  readByUser: {
    type: Boolean,
    default: false
  },
  readByUserAt: {
    type: Date
  },
  // NEW: Track when user last viewed this message
  lastUserView: {
    type: Date
  }
}, {
  timestamps: true
});

// Indexes for faster queries
contactSchema.index({ status: 1, createdAt: -1 });
contactSchema.index({ email: 1, createdAt: -1 });
contactSchema.index({ userId: 1, createdAt: -1 });
contactSchema.index({ isRead: 1 }); // For checking unread messages
contactSchema.index({ 'userReplies.date': -1 }); // For sorting user replies
contactSchema.index({ 'userReplies.adminReplies.date': -1 }); // For sorting admin replies within user replies
// NEW: Index for readByUser queries
contactSchema.index({ readByUser: 1, updatedAt: -1 });
// NEW: Index for unread admin replies queries
contactSchema.index({ 'userReplies.adminReplies.readByUser': 1 });

// Pre-save middleware to set readAt timestamp when isRead changes
contactSchema.pre('save', function(next) {
  if (this.isModified('isRead') && this.isRead && !this.readAt) {
    this.readAt = new Date();
  }
  // NEW: Set readByUserAt when readByUser changes
  if (this.isModified('readByUser') && this.readByUser && !this.readByUserAt) {
    this.readByUserAt = new Date();
  }
  next();
});

module.exports = mongoose.model('Contact', contactSchema);