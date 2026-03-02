const express = require('express');

const router = express.Router();

const { protect } = require('../middleware/auth');

const User = require('../models/User');
const UserProfile = require('../models/UserProfile');
const Post = require('../models/Post');
const CommunityPost = require('../models/CommunityPost');
const CommunityComment = require('../models/CommunityComment');
const Message = require('../models/Message');
const Tree = require('../models/Tree');
const Scan = require('../models/Scan');
const LatexBatch = require('../models/LatexBatch');
const LatexAnalysis = require('../models/LatexAnalysis');
const LeafAnalysis = require('../models/LeafAnalysis');
const TrunksAnalysis = require('../models/TrunksAnalysis');
const MarketData = require('../models/MarketData');
const Announcement = require('../models/Announcement');
const Notification = require('../models/Notification');
const Report = require('../models/Report');
const Contact = require('../models/Contact');
const SaveLocation = require('../models/SaveLocation');

const normalizeProfileImage = (user = {}) => {
  return user.profileImage || user.avatar?.url || user.profilePicture?.url || null;
};

const sanitizeUser = (user = {}) => {
  const next = { ...user };
  delete next.password;
  delete next.verificationToken;
  delete next.resetPasswordToken;
  delete next.resetPasswordExpire;
  delete next.emailVerificationToken;
  delete next.emailVerificationExpire;

  next.profileImage = normalizeProfileImage(next);
  return next;
};

const countMap = (payload) => {
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [key, Array.isArray(value) ? value.length : 0])
  );
};

router.get('/all', protect, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';

    const [
      users,
      userProfiles,
      posts,
      communityPosts,
      communityComments,
      messages,
      trees,
      scans,
      latexBatches,
      latexAnalyses,
      leafAnalyses,
      trunksAnalyses,
      marketData,
      announcements,
      notifications,
      reports,
      contacts,
      saveLocations
    ] = await Promise.all([
      User.find({}).lean(),
      UserProfile.find({}).lean(),
      Post.find({}).lean(),
      CommunityPost.find({}).lean(),
      CommunityComment.find({}).lean(),
      Message.find({}).lean(),
      Tree.find({}).lean(),
      Scan.find({}).lean(),
      LatexBatch.find({}).lean(),
      LatexAnalysis.find({}).lean(),
      LeafAnalysis.find({}).lean(),
      TrunksAnalysis.find({}).lean(),
      MarketData.find({}).sort({ timestamp: -1 }).limit(500).lean(),
      Announcement.find({}).sort({ createdAt: -1 }).lean(),
      Notification.find(isAdmin ? {} : { recipient: req.user.id })
        .populate('sender', 'name profileImage avatar profilePicture email')
        .populate('post', 'title')
        .populate('comment', 'content')
        .sort({ createdAt: -1 }),
      Report.find(isAdmin ? {} : { reporter: req.user.id }).sort({ createdAt: -1 }).lean(),
      Contact.find(
        isAdmin
          ? {}
          : {
              $or: [
                { userId: req.user.id },
                { user: req.user.id },
                { email: req.user.email }
              ]
            }
      ).sort({ createdAt: -1 }).lean(),
      SaveLocation.find(isAdmin ? {} : { user: req.user.id }).sort({ createdAt: -1 }).lean()
    ]);

    const data = {
      users: users.map(sanitizeUser),
      userProfiles,
      posts,
      communityPosts,
      communityComments,
      messages,
      trees,
      scans,
      latexBatches,
      latexAnalyses,
      leafAnalyses,
      trunksAnalyses,
      marketData,
      announcements,
      notifications,
      reports,
      contacts,
      saveLocations
    };

    res.json({
      success: true,
      syncedAt: new Date().toISOString(),
      counts: countMap(data),
      data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to build sync payload'
    });
  }
});

module.exports = router;
