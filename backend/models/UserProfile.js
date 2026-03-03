const mongoose = require('mongoose');

const userProfileSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  name: {
    type: String,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  phone: {
    type: String,
    trim: true
  },
  bio: {
    type: String,
    default: '',
    maxlength: 500
  },
  profilePicture: {
    public_id: {
      type: String,
      default: ''
    },
    url: {
      type: String,
      default: ''
    }
  },
  avatar: {
    public_id: {
      type: String,
      default: ''
    },
    url: {
      type: String,
      default: ''
    }
  },
  address: {
    street: {
      type: String,
      default: ''
    },
    barangay: {
      type: String,
      default: ''
    },
    city: {
      type: String,
      default: ''
    },
    zipCode: {
      type: String,
      default: ''
    }
  },
  followers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  following: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  blockedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  blockedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  socialLinks: {
    facebook: { type: String, default: '' },
    twitter: { type: String, default: '' },
    instagram: { type: String, default: '' },
    linkedin: { type: String, default: '' }
  },
  privacySettings: {
    showEmail: { type: Boolean, default: true },
    showPhone: { type: Boolean, default: true },
    showAddress: { type: Boolean, default: true },
    allowMessagesFromNonFollowers: { type: Boolean, default: true }
  },
  stats: {
    totalPosts: { type: Number, default: 0 },
    totalFollowers: { type: Number, default: 0 },
    totalFollowing: { type: Number, default: 0 }
  },
  lastActive: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
userProfileSchema.index({ user: 1 });
userProfileSchema.index({ name: 'text', email: 'text' });
userProfileSchema.index({ followers: 1 });
userProfileSchema.index({ following: 1 });
userProfileSchema.index({ blockedUsers: 1 });

// Method to update stats
userProfileSchema.methods.updateStats = async function() {
  const CommunityPost = mongoose.model('CommunityPost');
  const totalPosts = await CommunityPost.countDocuments({ user: this.user });
  
  this.stats.totalPosts = totalPosts;
  this.stats.totalFollowers = this.followers.length;
  this.stats.totalFollowing = this.following.length;
  await this.save();
};

// Method to follow a user
userProfileSchema.methods.followUser = async function(userId) {
  if (!this.following.includes(userId)) {
    this.following.push(userId);
    await this.save();
    
    const targetProfile = await mongoose.model('UserProfile').findOne({ user: userId });
    if (targetProfile && !targetProfile.followers.includes(this.user)) {
      targetProfile.followers.push(this.user);
      await targetProfile.save();
    }
  }
};

// Method to unfollow a user
userProfileSchema.methods.unfollowUser = async function(userId) {
  this.following = this.following.filter(id => id.toString() !== userId.toString());
  await this.save();
  
  const targetProfile = await mongoose.model('UserProfile').findOne({ user: userId });
  if (targetProfile) {
    targetProfile.followers = targetProfile.followers.filter(id => id.toString() !== this.user.toString());
    await targetProfile.save();
  }
};

// Method to block a user.
userProfileSchema.methods.blockUser = async function(userId) {
  if (!this.blockedUsers.includes(userId)) {
    this.blockedUsers.push(userId);
    
    await this.unfollowUser(userId);
    
    this.followers = this.followers.filter(id => id.toString() !== userId.toString());
    this.following = this.following.filter(id => id.toString() !== userId.toString());
    
    await this.save();
    
    const targetProfile = await mongoose.model('UserProfile').findOne({ user: userId });
    if (targetProfile && !targetProfile.blockedBy.includes(this.user)) {
      targetProfile.blockedBy.push(this.user);
      await targetProfile.save();
    }
  }
};

// Method to unblock a user
userProfileSchema.methods.unblockUser = async function(userId) {
  this.blockedUsers = this.blockedUsers.filter(id => id.toString() !== userId.toString());
  await this.save();
  
  const targetProfile = await mongoose.model('UserProfile').findOne({ user: userId });
  if (targetProfile) {
    targetProfile.blockedBy = targetProfile.blockedBy.filter(id => id.toString() !== this.user.toString());
    await targetProfile.save();
  }
};

// Method to check if blocking a user
userProfileSchema.methods.isBlocking = function(userId) {
  return this.blockedUsers.some(id => id.toString() === userId.toString());
};

// Method to check if blocked by a user
userProfileSchema.methods.isBlockedBy = function(userId) {
  return this.blockedBy.some(id => id.toString() === userId.toString());
};

// Method to check if following a user
userProfileSchema.methods.isFollowing = function(userId) {
  return this.following.some(id => id.toString() === userId.toString());
};

const UserProfile = mongoose.model('UserProfile', userProfileSchema);

module.exports = UserProfile;