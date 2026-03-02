const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  // Compatibility alias used by the referenced backend/web stack.
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  text: {
    type: String,
    default: ''
  },
  // Compatibility alias used by the referenced backend/web stack.
  content: {
    type: String,
    default: ''
  },
  attachments: [{
    url: String,
    publicId: String,
    name: String,
    type: { type: String },
    size: Number
  }],
  isRead: {
    type: Boolean,
    default: false
  },
  requestStatus: {
    type: String,
    enum: ['accepted', 'pending', 'rejected'],
    default: 'accepted'
  },
  // Compatibility status model used by the referenced backend/web stack.
  status: {
    type: String,
    enum: ['sent', 'delivered', 'accepted', 'rejected', 'pending'],
    default: 'sent'
  },
  isRequest: {
    type: Boolean,
    default: false
  },
  isDeletedBySender: {
    type: Boolean,
    default: false
  },
  isDeletedByRecipient: {
    type: Boolean,
    default: false
  },
  // Sender can "unsend" so both participants see a deleted placeholder.
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Frontend compatibility: existing UI expects `read`
messageSchema.virtual('read').get(function() {
  return this.isRead;
});

// Keep old and new schemas interoperable when saving.
messageSchema.pre('validate', function(next) {
  if (!this.receiver && this.recipient) {
    this.receiver = this.recipient;
  }
  if (!this.recipient && this.receiver) {
    this.recipient = this.receiver;
  }
  if (!this.text && this.content) {
    this.text = this.content;
  }
  if (!this.content && this.text) {
    this.content = this.text;
  }

  if (!this.requestStatus) {
    if (this.status === 'pending') this.requestStatus = 'pending';
    else if (this.status === 'rejected') this.requestStatus = 'rejected';
    else this.requestStatus = 'accepted';
  }
  if (!this.status) {
    this.status = this.requestStatus === 'pending' ? 'pending' : 'sent';
  }
  if (typeof this.isRequest !== 'boolean') {
    this.isRequest = this.requestStatus === 'pending';
  }

  next();
});

messageSchema.set('toJSON', { virtuals: true });
messageSchema.set('toObject', { virtuals: true });

// Index for faster queries
messageSchema.index({ sender: 1, receiver: 1 });
messageSchema.index({ receiver: 1, sender: 1 });
messageSchema.index({ sender: 1, recipient: 1 });
messageSchema.index({ recipient: 1, sender: 1 });
messageSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
