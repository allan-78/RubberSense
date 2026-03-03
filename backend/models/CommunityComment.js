const mongoose = require('mongoose');

const CommunityCommentSchema = new mongoose.Schema({
  post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CommunityPost',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    default: ''
  },
  media: {
    url: {
      type: String
    },
    mimetype: {
      type: String
    },
    filename: {
      type: String
    },
    size: {
      type: Number
    },
    originalname: {
      type: String
    }
  },
  parentComment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CommunityComment',
    default: null
  },
  replies: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CommunityComment'
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
  reports: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Report'
  }],
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
CommunityCommentSchema.virtual('likesCount').get(function() {
  return this.likes.length;
});

// Virtual for replies count
CommunityCommentSchema.virtual('repliesCount').get(function() {
  return this.replies.length;
});

// Virtual for reports count
CommunityCommentSchema.virtual('reportsCount').get(function() {
  return this.reports ? this.reports.length : 0;
});

// Validation: At least one of content or media must be present
CommunityCommentSchema.pre('validate', function(next) {
  if (!this.content && !this.media) {
    this.invalidate('content', 'Comment must have either content or media');
  }
  next();
});

// Don't show deleted comments in queries by default
CommunityCommentSchema.pre('find', function(next) {
  this.where({ isDeleted: false });
  next();
});

CommunityCommentSchema.pre('findOne', function(next) {
  this.where({ isDeleted: false });
  next();
});

module.exports = mongoose.model('CommunityComment', CommunityCommentSchema);