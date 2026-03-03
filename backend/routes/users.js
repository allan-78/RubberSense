const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Post = require('../models/Post');
const Tree = require('../models/Tree');
const Scan = require('../models/Scan');
const Message = require('../models/Message');
const Notification = require('../models/Notification');
const UserProfile = require('../models/UserProfile');
const { emitToUser } = require('../socket');
const { protect } = require('../middleware/auth');
const fs = require('fs');
const upload = require('../middleware/upload');
const { uploadToCloudinary } = require('../config/cloudinary');
const { sendPushToUser } = require('../services/expoPush');

const createOrRefreshFollowNotification = async ({ recipientId, senderId }) => {
  if (!recipientId || !senderId || String(recipientId) === String(senderId)) return;

  try {
    const [notification, sender] = await Promise.all([
      Notification.findOneAndUpdate(
        {
          recipient: recipientId,
          sender: senderId,
          type: 'follow'
        },
        {
          $set: {
            message: 'started following you',
            isRead: false,
            link: `/profile/${senderId}`,
            additionalData: {
              action: 'follow',
              senderId: String(senderId)
            }
          }
        },
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true
        }
      ),
      User.findById(senderId).select('name')
    ]);

    const senderName = sender?.name || 'Someone';
    await sendPushToUser(recipientId, {
      title: 'New Follower',
      body: `${senderName} started following you`,
      data: {
        type: 'follow',
        notificationId: String(notification?._id || ''),
        senderId: String(senderId),
        link: `/profile/${senderId}`
      }
    });
  } catch (error) {
    console.error('Failed to upsert follow notification:', error.message);
  }
};

const syncUserProfileBase = async (userId) => {
  if (!userId) return null;

  const user = await User.findById(userId).select('name email bio profileImage avatar profilePicture');
  if (!user) return null;

  const imageUrl = user.profileImage || user.avatar?.url || user.profilePicture?.url || '';
  const publicId = user.avatar?.public_id || user.profilePicture?.public_id || '';

  return UserProfile.findOneAndUpdate(
    { user: userId },
    {
      $setOnInsert: { user: userId },
      $set: {
        name: user.name || '',
        email: user.email || '',
        bio: user.bio || '',
        avatar: { public_id: publicId, url: imageUrl },
        profilePicture: { public_id: publicId, url: imageUrl },
      }
    },
    { new: true, upsert: true }
  );
};

const refreshUserProfileStats = async (userId) => {
  if (!userId) return;
  const profile = await UserProfile.findOne({ user: userId }).select('followers following');
  if (!profile) return;
  await UserProfile.updateOne(
    { user: userId },
    {
      $set: {
        'stats.totalFollowers': Array.isArray(profile.followers) ? profile.followers.length : 0,
        'stats.totalFollowing': Array.isArray(profile.following) ? profile.following.length : 0,
        lastActive: new Date()
      }
    }
  );
};

const syncUserProfileFollow = async ({ followerId, targetId, isFollowing }) => {
  if (!followerId || !targetId) return;

  await Promise.all([
    syncUserProfileBase(followerId),
    syncUserProfileBase(targetId)
  ]);

  if (isFollowing) {
    await Promise.all([
      UserProfile.findOneAndUpdate(
        { user: followerId },
        { $addToSet: { following: targetId }, $pull: { blockedUsers: targetId } }
      ),
      UserProfile.findOneAndUpdate(
        { user: targetId },
        { $addToSet: { followers: followerId }, $pull: { blockedBy: followerId } }
      )
    ]);
  } else {
    await Promise.all([
      UserProfile.findOneAndUpdate(
        { user: followerId },
        { $pull: { following: targetId } }
      ),
      UserProfile.findOneAndUpdate(
        { user: targetId },
        { $pull: { followers: followerId } }
      )
    ]);
  }

  await Promise.all([
    refreshUserProfileStats(followerId),
    refreshUserProfileStats(targetId)
  ]);
};

// @route   PUT /api/users/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', protect, upload.single('profileImage'), async (req, res) => {
  console.log('📝 [PUT /profile] Request received');
  console.log('📦 Body:', req.body);
  console.log('📁 File:', req.file ? req.file.filename : 'No file');

  try {
    const { name, bio, phoneNumber, location } = req.body;
    
    // Find user
    let user = await User.findById(req.user.id);
    if (!user) {
      console.log('❌ User not found:', req.user.id);
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Update fields
    if (name) user.name = name;
    if (bio) user.bio = bio;
    if (phoneNumber) user.phoneNumber = phoneNumber;
    if (location) user.location = location;

    // Handle Image Upload
    if (req.file) {
      console.log('🚀 Uploading to Cloudinary...');
      try {
        const uploadResult = await uploadToCloudinary(req.file, 'rubbersense/profiles');
        console.log('✅ Cloudinary success:', uploadResult.url);
        user.profileImage = uploadResult.url;
        user.avatar = {
          public_id: uploadResult.publicId,
          url: uploadResult.url
        };
        user.profilePicture = {
          public_id: uploadResult.publicId,
          url: uploadResult.url
        };
        fs.unlinkSync(req.file.path);
      } catch (cloudError) {
        console.error('❌ Cloudinary upload failed:', cloudError);
        // Don't fail the whole request, just log it? Or fail?
        // Let's fail for now to let user know image didn't work.
        throw new Error('Image upload failed: ' + cloudError.message);
      }
    }

    await user.save();
    await syncUserProfileBase(user._id);
    console.log('✅ Profile updated successfully');

    // Re-fetch user with populated followers/following for complete response
    const userWithPopulated = await User.findById(req.user.id)
      .populate('followers', 'name profileImage avatar profilePicture')
      .populate('following', 'name profileImage avatar profilePicture');

    res.json({
      success: true,
      data: userWithPopulated,
      user: userWithPopulated,
      message: 'Profile updated successfully'
    });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error('❌ Update profile error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// @route   GET /api/users/:id
// @desc    Get user profile by ID
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const requester = await User.findById(req.user.id).select('blockedUsers');

    const user = await User.findById(req.params.id)
      .select('-password -verificationToken')
      .populate('followers', 'name email profileImage avatar profilePicture')
      .populate('following', 'name email profileImage avatar profilePicture');

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
    const isBlockedByMe = Array.isArray(requester?.blockedUsers)
      ? requester.blockedUsers.some(id => String(id) === String(user._id))
      : false;
    const hasBlockedMe = Array.isArray(user.blockedUsers)
      ? user.blockedUsers.some(id => String(id?._id || id) === String(req.user.id))
      : false;

    const userObj = user.toObject();
    userObj.profileImage = userObj.profileImage || userObj.avatar?.url || userObj.profilePicture?.url || null;
    delete userObj.blockedUsers;

    res.json({
      success: true,
      data: {
        ...userObj,
        stats: {
          posts: postCount,
          totalPosts: postCount,
          trees: treeCount,
          totalTrees: treeCount,
          scans: scanCount,
          totalFollowers: Array.isArray(user.followers) ? user.followers.length : 0,
          totalFollowing: Array.isArray(user.following) ? user.following.length : 0,
          followers: Array.isArray(user.followers) ? user.followers.length : 0,
          following: Array.isArray(user.following) ? user.following.length : 0
        },
        followersCount: Array.isArray(user.followers) ? user.followers.length : 0,
        followingCount: Array.isArray(user.following) ? user.following.length : 0,
        isFollowing,
        isBlockedByMe,
        hasBlockedMe
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

    const blockedByMe = Array.isArray(currentUser.blockedUsers)
      && currentUser.blockedUsers.some(id => String(id) === String(req.params.id));
    const blockedMe = Array.isArray(userToFollow.blockedUsers)
      && userToFollow.blockedUsers.some(id => String(id) === String(req.user.id));

    if (blockedByMe || blockedMe) {
      return res.status(403).json({
        success: false,
        error: 'Follow action unavailable due to block settings'
      });
    }

    // Check if already following
    const isFollowing = userToFollow.followers.some(id => id.toString() === req.user.id);

    if (isFollowing) {
      // Unfollow - atomic pull
      await User.findByIdAndUpdate(req.params.id, { $pull: { followers: req.user.id } });
      await User.findByIdAndUpdate(req.user.id, { $pull: { following: req.params.id } });
      await syncUserProfileFollow({
        followerId: req.user.id,
        targetId: req.params.id,
        isFollowing: false
      });
    } else {
      // Follow - atomic addToSet (prevents duplicates at DB layer)
      await User.findByIdAndUpdate(req.params.id, { $addToSet: { followers: req.user.id } });
      await User.findByIdAndUpdate(req.user.id, { $addToSet: { following: req.params.id } });
      await syncUserProfileFollow({
        followerId: req.user.id,
        targetId: req.params.id,
        isFollowing: true
      });
      await createOrRefreshFollowNotification({
        recipientId: req.params.id,
        senderId: req.user.id
      });
    }

    // Fetch updated counts for both target and requester
    const [updatedUser, updatedCurrent] = await Promise.all([
      User.findById(req.params.id).select('followers'),
      User.findById(req.user.id).select('following')
    ]);

    res.json({ 
      success: true, 
      isFollowing: !isFollowing,
      followersCount: updatedUser.followers.length,
      followingCount: Array.isArray(updatedCurrent?.following) ? updatedCurrent.following.length : 0,
      targetUserId: String(req.params.id),
      currentUserId: String(req.user.id),
      message: isFollowing ? 'User unfollowed successfully' : 'User followed successfully'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// @route   PUT /api/users/:id/block
// @desc    Block a user
// @access  Private
router.put('/:id/block', protect, async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ success: false, error: 'Cannot block yourself' });
    }

    const [targetUser, currentUser] = await Promise.all([
      User.findById(req.params.id),
      User.findById(req.user.id)
    ]);

    if (!targetUser || !currentUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    await Promise.all([
      User.findByIdAndUpdate(req.user.id, { $addToSet: { blockedUsers: req.params.id }, $pull: { following: req.params.id, followers: req.params.id } }),
      User.findByIdAndUpdate(req.params.id, { $pull: { following: req.user.id, followers: req.user.id } }),
      Message.updateMany(
        {
          requestStatus: 'pending',
          $or: [
            { sender: req.user.id, receiver: req.params.id },
            { sender: req.params.id, receiver: req.user.id }
          ]
        },
        { $set: { requestStatus: 'rejected' } }
      )
    ]);

    const updatedCurrentUser = await User.findById(req.user.id).select('blockedUsers');
    const isBlocked = updatedCurrentUser.blockedUsers.some(id => String(id) === String(req.params.id));

    const socketPayload = {
      withUserId: req.params.id,
      blockedByMe: isBlocked,
      updatedBy: req.user.id,
    };
    emitToUser(req.user.id, 'chat:block-updated', socketPayload);
    emitToUser(req.params.id, 'chat:block-updated', {
      withUserId: req.user.id,
      blockedMe: isBlocked,
      updatedBy: req.user.id,
    });

    res.json({
      success: true,
      isBlocked,
      blockedUsersCount: updatedCurrentUser.blockedUsers.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// @route   PUT /api/users/:id/unblock
// @desc    Unblock a user
// @access  Private
router.put('/:id/unblock', protect, async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ success: false, error: 'Cannot unblock yourself' });
    }

    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    await User.findByIdAndUpdate(req.user.id, { $pull: { blockedUsers: req.params.id } });
    const updatedCurrentUser = await User.findById(req.user.id).select('blockedUsers');
    const isBlocked = updatedCurrentUser.blockedUsers.some(id => String(id) === String(req.params.id));

    emitToUser(req.user.id, 'chat:block-updated', {
      withUserId: req.params.id,
      blockedByMe: isBlocked,
      updatedBy: req.user.id,
    });
    emitToUser(req.params.id, 'chat:block-updated', {
      withUserId: req.user.id,
      blockedMe: isBlocked,
      updatedBy: req.user.id,
    });

    res.json({
      success: true,
      isBlocked,
      blockedUsersCount: updatedCurrentUser.blockedUsers.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
