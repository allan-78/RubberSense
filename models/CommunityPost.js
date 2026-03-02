const mongoose = require('mongoose');

const CommunityPostSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    trim: true,
    maxlength: [500, 'Title cannot exceed 500 characters']
  },
  content: {
    type: String,
    default: ''
  },
  media: [{
    url: {
      type: String,
      required: true
    },
    mimetype: {
      type: String,
      required: true
    },
    filename: {
      type: String,
      required: true
    },
    size: {
      type: Number,
      required: true
    },
    originalname: {
      type: String,
      required: true
    }
  }],
  tags: [{
    type: String,
    trim: true
  }],
  likes: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  comments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CommunityComment'
  }],
  reports: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Report'
  }],
  views: {
    type: Number,
    default: 0
  },
  isPinned: {
    type: Boolean,
    default: false
  },
  isEdited: {
    type: Boolean,
    default: false
  },
  lastEdited: {
    type: Date
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  isHidden: {
    type: Boolean,
    default: false
  },
  hiddenReason: {
    type: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for likes count
CommunityPostSchema.virtual('likesCount').get(function() {
  return this.likes ? this.likes.length : 0;
});

// Virtual for comments count
CommunityPostSchema.virtual('commentsCount').get(function() {
  return this.comments ? this.comments.length : 0;
});

// Virtual for reports count
CommunityPostSchema.virtual('reportsCount').get(function() {
  return this.reports ? this.reports.length : 0;
});

// Auto-extract tags from content
CommunityPostSchema.pre('save', function(next) {
  if (this.isModified('content') && this.content) {
    const hashtags = this.content.match(/#[\w\u0600-\u06FF\u4e00-\u9fff]+/g) || [];
    const uniqueHashtags = [...new Set(hashtags.map(tag => tag.slice(1).toLowerCase()))];
    this.tags = uniqueHashtags.slice(0, 10);
  }
  next();
});

// Validation: At least one of title, content, or media must be present
CommunityPostSchema.pre('validate', function(next) {
  if (!this.title && !this.content && (!this.media || this.media.length === 0)) {
    this.invalidate('content', 'Post must have either title, content, or media');
  }
  next();
});

// Don't show deleted posts in queries by default
CommunityPostSchema.pre('find', function(next) {
  this.where({ isDeleted: false });
  next();
});

CommunityPostSchema.pre('findOne', function(next) {
  this.where({ isDeleted: false });
  next();
});

module.exports = mongoose.model('CommunityPost', CommunityPostSchema);