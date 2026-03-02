const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  type: {
    type: String,
    required: true,
    enum: [
      'follow', 
      'post_like', 
      'post_comment', 
      'comment_like', 
      'new_post',
      'content_reported',    // When content is reported by another user
      'content_hidden'       // When content is hidden by admin
    ]
  },
  post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CommunityPost'
  },
  comment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CommunityComment'
  },
  messageRef: {  // Changed from 'message' to avoid conflict with message field
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  message: {
    type: String,
    required: true
  },
  isRead: {
    type: Boolean,
    default: false
  },
  link: {
    type: String // URL to navigate when clicking notification
  },
  reportReason: {
    type: String,
    enum: [
      'spam', 
      'harassment', 
      'hate_speech', 
      'inappropriate_content', 
      'false_information', 
      'other',
      'admin_action'  // ADD THIS LINE FOR ADMIN ACTIONS.
    ]
  },
  contentType: {
    type: String,
    enum: ['post', 'comment', 'message']
  },
  adminAction: {
    type: String,
    enum: ['hidden', 'deleted', 'warned']
  },
  additionalData: {
    type: mongoose.Schema.Types.Mixed, // For any additional notification data
    default: {}
  }
}, {
  timestamps: true
});

// Indexes for performance
NotificationSchema.index({ recipient: 1, createdAt: -1 });
NotificationSchema.index({ recipient: 1, isRead: 1 });
NotificationSchema.index({ createdAt: -1 });
NotificationSchema.index({ type: 1 });
NotificationSchema.index({ contentType: 1 });

// Virtual for getting the actual content reference based on contentType
NotificationSchema.virtual('contentRef').get(function() {
  if (this.contentType === 'post' && this.post) return this.post;
  if (this.contentType === 'comment' && this.comment) return this.comment;
  if (this.contentType === 'message' && this.messageRef) return this.messageRef;
  return null;
});

// Method to get notification details
NotificationSchema.methods.getDetails = function() {
  let contentStr = '';
  let actionStr = '';
  
  switch (this.contentType) {
    case 'post':
      contentStr = 'post';
      break;
    case 'comment':
      contentStr = 'comment';
      break;
    case 'message':
      contentStr = 'message';
      break;
  }
  
  switch (this.type) {
    case 'content_reported':
      actionStr = 'has been reported';
      break;
    case 'content_hidden':
      actionStr = 'has been hidden by Admin';
      break;
  }
  
  return { contentStr, actionStr };
};

const Notification = mongoose.model('Notification', NotificationSchema);

module.exports = Notification;