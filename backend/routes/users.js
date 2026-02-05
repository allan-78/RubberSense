const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Post = require('../models/Post');
const Tree = require('../models/Tree');
const Scan = require('../models/Scan');
const { protect } = require('../middleware/auth');

// @route   GET /api/users/:id
// @desc    Get user profile by ID
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password -verificationToken')
      .populate('followers', 'name profileImage')
      .populate('following', 'name profileImage');

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Get stats
    const postCount = await Post.countDocuments({ user: user._id });
    const treeCount = await Tree.countDocuments({ owner: user._id });
    // Assuming scans are stored in Scan model. Adjust if needed.
    const scanCount = await Scan.countDocuments({ user: user._id });

    const isFollowing = user.followers.some(
      follower => follower._id.toString() === req.user.id
    );

    res.json({
      success: true,
      data: {
        ...user.toObject(),
        stats: {
          posts: postCount,
          trees: treeCount,
          scans: scanCount
        },
        isFollowing
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// @route   PUT /api/users/:id/follow
// @desc    Follow/Unfollow a user
// @access  Private
router.put('/:id/follow', protect, async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ success: false, error: 'Cannot follow yourself' });
    }

    const userToFollow = await User.findById(req.params.id);
    const currentUser = await User.findById(req.user.id);

    if (!userToFollow || !currentUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Check if already following
    const isFollowing = userToFollow.followers.some(id => id.toString() === req.user.id);

    if (isFollowing) {
      // Unfollow - atomic pull
      await User.findByIdAndUpdate(req.params.id, { $pull: { followers: req.user.id } });
      await User.findByIdAndUpdate(req.user.id, { $pull: { following: req.params.id } });
    } else {
      // Follow - atomic addToSet (prevents duplicates at DB layer)
      await User.findByIdAndUpdate(req.params.id, { $addToSet: { followers: req.user.id } });
      await User.findByIdAndUpdate(req.user.id, { $addToSet: { following: req.params.id } });
    }

    // Fetch updated count
    const updatedUser = await User.findById(req.params.id);

    res.json({ 
      success: true, 
      isFollowing: !isFollowing,
      followersCount: updatedUser.followers.length 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
