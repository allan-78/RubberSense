const express = require('express');
const fs = require('fs');

const router = express.Router();

const upload = require('../middleware/upload');
const { protect } = require('../middleware/auth');
const { uploadToCloudinary } = require('../config/cloudinary');
const User = require('../models/User');
const UserProfile = require('../models/UserProfile');
const CommunityPost = require('../models/CommunityPost');
const Notification = require('../models/Notification');
const Tree = require('../models/Tree');
const Scan = require('../models/Scan');
const { sendPushToUser } = require('../services/expoPush');

const cleanLocalFile = (filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (_) {
    // Ignore cleanup errors.
  }
};

const resolveProfileImage = (user = {}) => {
  return user.profileImage || user.avatar?.url || user.profilePicture?.url || null;
};

const mapSimpleUser = (user = null) => {
  if (!user) return null;

  const image = resolveProfileImage(user);

  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    profileImage: image,
    profilePicture: {
      public_id: user.profilePicture?.public_id || user.avatar?.public_id || '',
      url: image || ''
    },
    avatar: {
      public_id: user.avatar?.public_id || user.profilePicture?.public_id || '',
      url: image || ''
    }
  };
};

const mapPost = (post = null) => {
  if (!post) return null;

  return {
    _id: post._id,
    user: mapSimpleUser(post.user),
    title: post.title || '',
    content: post.content || '',
    media: post.media || [],
    likesCount: Array.isArray(post.likes) ? post.likes.length : 0,
    commentsCount: Array.isArray(post.comments) ? post.comments.length : 0,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt
  };
};

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

const resolveFollowCounts = async (userId, userFollowersCount = 0, userFollowingCount = 0) => {
  if (!userId) {
    return { followersCount: userFollowersCount, followingCount: userFollowingCount };
  }

  try {
    const profile = await UserProfile.findOne({ user: userId })
      .select('followers following stats.totalFollowers stats.totalFollowing')
      .lean();

    if (profile) {
      const profileFollowers = Array.isArray(profile.followers) ? profile.followers.length : 0;
      const profileFollowing = Array.isArray(profile.following) ? profile.following.length : 0;
      const profileFollowersStats = Number(profile?.stats?.totalFollowers || profileFollowers);
      const profileFollowingStats = Number(profile?.stats?.totalFollowing || profileFollowing);

      return {
        followersCount: Math.max(profileFollowers, profileFollowersStats),
        followingCount: Math.max(profileFollowing, profileFollowingStats)
      };
    }

    return {
      followersCount: userFollowersCount,
      followingCount: userFollowingCount
    };
  } catch (_) {
    return { followersCount: userFollowersCount, followingCount: userFollowingCount };
  }
};

const getProfileFollowCollections = async (userId, fallbackFollowers = [], fallbackFollowing = []) => {
  try {
    const profile = await UserProfile.findOne({ user: userId })
      .populate('followers', 'name email profileImage avatar profilePicture')
      .populate('following', 'name email profileImage avatar profilePicture')
      .lean();

    if (!profile) {
      return {
        followers: fallbackFollowers,
        following: fallbackFollowing,
        hasProfile: false,
        profileImage: null
      };
    }

    const profileImage = profile?.profilePicture?.url || profile?.avatar?.url || null;

    return {
      followers: Array.isArray(profile.followers) ? profile.followers : [],
      following: Array.isArray(profile.following) ? profile.following : [],
      hasProfile: true,
      profileImage
    };
  } catch (_) {
    return {
      followers: fallbackFollowers,
      following: fallbackFollowing,
      hasProfile: false,
      profileImage: null
    };
  }
};

router.get('/community/posts/user/:userId', protect, async (req, res) => {
  try {
    const posts = await CommunityPost.find({
      user: req.params.userId,
      isDeleted: false,
      isHidden: { $ne: true }
    })
      .populate('user', 'name email profileImage avatar profilePicture')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: posts.length, data: posts.map(mapPost) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/blocked', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate('blockedUsers', 'name email profileImage avatar profilePicture');
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({
      success: true,
      data: (user.blockedUsers || []).map(mapSimpleUser)
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/me/update', protect, (req, res) => {
  upload.fields([
    { name: 'profileImage', maxCount: 1 },
    { name: 'avatar', maxCount: 1 }
  ])(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }

    const profileImageFile = req.files?.profileImage?.[0] || req.files?.avatar?.[0] || null;

    try {
      const user = await User.findById(req.user.id);
      if (!user) {
        if (profileImageFile) cleanLocalFile(profileImageFile.path);
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      if (typeof req.body.name === 'string') user.name = req.body.name.trim();
      if (typeof req.body.contact === 'string') user.phoneNumber = req.body.contact.trim();
      if (typeof req.body.phoneNumber === 'string') user.phoneNumber = req.body.phoneNumber.trim();
      if (typeof req.body.bio === 'string') user.bio = req.body.bio.trim();
      if (typeof req.body.location === 'string') user.location = req.body.location.trim();

      if (profileImageFile) {
        const uploaded = await uploadToCloudinary(profileImageFile, 'rubbersense/profiles');
        user.profileImage = uploaded.url;
        user.avatar = {
          public_id: uploaded.publicId,
          url: uploaded.url
        };
        user.profilePicture = {
          public_id: uploaded.publicId,
          url: uploaded.url
        };
        cleanLocalFile(profileImageFile.path);
      }

      await user.save();
      await syncUserProfileBase(user._id);

      // Populate followers and following for complete response
      const userWithPopulated = await User.findById(req.user.id)
        .populate('followers', 'name email profileImage avatar profilePicture')
        .populate('following', 'name email profileImage avatar profilePicture');

      const [postCount, treeCount, scanCount] = await Promise.all([
        CommunityPost.countDocuments({ user: user._id, isDeleted: false }),
        Tree.countDocuments({ owner: user._id }),
        Scan.countDocuments({ user: user._id })
      ]);

      const followCollections = await getProfileFollowCollections(
        user._id,
        userWithPopulated.followers || [],
        userWithPopulated.following || []
      );

      const mapped = mapSimpleUser(userWithPopulated.toObject());
      const followCounts = await resolveFollowCounts(
        user._id,
        (followCollections.followers || []).length,
        (followCollections.following || []).length
      );
      const fullResponse = {
        ...mapped,
        bio: userWithPopulated.bio || '',
        location: userWithPopulated.location || '',
        phoneNumber: userWithPopulated.phoneNumber || '',
        followers: (followCollections.followers || []).map(mapSimpleUser),
        following: (followCollections.following || []).map(mapSimpleUser),
        followersCount: followCounts.followersCount,
        followingCount: followCounts.followingCount,
        stats: {
          posts: postCount,
          totalPosts: postCount,
          trees: treeCount,
          totalTrees: treeCount,
          scans: scanCount,
          totalFollowers: followCounts.followersCount,
          totalFollowing: followCounts.followingCount,
          followers: followCounts.followersCount,
          following: followCounts.followingCount
        }
      };

      return res.json({ success: true, user: fullResponse, data: fullResponse, message: 'Profile updated successfully' });
    } catch (error) {
      if (profileImageFile) cleanLocalFile(profileImageFile.path);
      return res.status(500).json({ success: false, error: error.message });
    }
  });
});

router.get('/:userId/followers', protect, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).populate('followers', 'name email profileImage avatar profilePicture');
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const followCollections = await getProfileFollowCollections(
      req.params.userId,
      user.followers || [],
      user.following || []
    );

    res.json({ success: true, data: (followCollections.followers || []).map(mapSimpleUser) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:userId/following', protect, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).populate('following', 'name email profileImage avatar profilePicture');
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const followCollections = await getProfileFollowCollections(
      req.params.userId,
      user.followers || [],
      user.following || []
    );

    res.json({ success: true, data: (followCollections.following || []).map(mapSimpleUser) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:userId/follow-status', protect, async (req, res) => {
  try {
    const target = await User.findById(req.params.userId).select('followers');
    if (!target) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const currentUserProfile = await UserProfile.findOne({ user: req.user.id }).select('following').lean();

    let isFollowing;
    if (currentUserProfile) {
      isFollowing = Array.isArray(currentUserProfile.following)
        && currentUserProfile.following.some((id) => String(id) === String(req.params.userId));
    } else {
      isFollowing = (target.followers || []).some((id) => String(id) === String(req.user.id));
    }

    res.json({ success: true, isFollowing });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:userId/follow', protect, async (req, res) => {
  try {
    if (String(req.params.userId) === String(req.user.id)) {
      return res.status(400).json({ success: false, error: 'Cannot follow yourself' });
    }

    const [targetUser, currentUser] = await Promise.all([
      User.findById(req.params.userId),
      User.findById(req.user.id)
    ]);

    if (!targetUser || !currentUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const blockedByMe = Array.isArray(currentUser.blockedUsers)
      && currentUser.blockedUsers.some((id) => String(id) === String(req.params.userId));
    const blockedMe = Array.isArray(targetUser.blockedUsers)
      && targetUser.blockedUsers.some((id) => String(id) === String(req.user.id));

    if (blockedByMe || blockedMe) {
      return res.status(403).json({
        success: false,
        error: 'Follow action unavailable due to block settings'
      });
    }

    const currentProfile = await UserProfile.findOne({ user: req.user.id }).select('following').lean();
    const alreadyFollowingByProfile = Array.isArray(currentProfile?.following)
      && currentProfile.following.some((id) => String(id) === String(req.params.userId));
    const alreadyFollowingByUser = (targetUser.followers || []).some((id) => String(id) === String(req.user.id));
    const alreadyFollowing = alreadyFollowingByProfile || alreadyFollowingByUser;
    if (!alreadyFollowing) {
      await Promise.all([
        User.findByIdAndUpdate(req.params.userId, { $addToSet: { followers: req.user.id } }),
        User.findByIdAndUpdate(req.user.id, { $addToSet: { following: req.params.userId } })
      ]);
      await syncUserProfileFollow({
        followerId: req.user.id,
        targetId: req.params.userId,
        isFollowing: true
      });
      await createOrRefreshFollowNotification({
        recipientId: req.params.userId,
        senderId: req.user.id
      });
    }

    const [updatedTarget, updatedCurrent] = await Promise.all([
      User.findById(req.params.userId).select('followers'),
      User.findById(req.user.id).select('following')
    ]);
    const targetCounts = await resolveFollowCounts(
      req.params.userId,
      Array.isArray(updatedTarget?.followers) ? updatedTarget.followers.length : 0,
      0
    );
    const currentCounts = await resolveFollowCounts(
      req.user.id,
      0,
      Array.isArray(updatedCurrent?.following) ? updatedCurrent.following.length : 0
    );

    res.json({
      success: true,
      message: 'User followed successfully',
      isFollowing: true,
      followersCount: targetCounts.followersCount,
      followingCount: currentCounts.followingCount,
      targetUserId: String(req.params.userId),
      currentUserId: String(req.user.id)
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/:userId/unfollow', protect, async (req, res) => {
  try {
    await Promise.all([
      User.findByIdAndUpdate(req.params.userId, { $pull: { followers: req.user.id } }),
      User.findByIdAndUpdate(req.user.id, { $pull: { following: req.params.userId } })
    ]);
    await syncUserProfileFollow({
      followerId: req.user.id,
      targetId: req.params.userId,
      isFollowing: false
    });

    const [updatedTarget, updatedCurrent] = await Promise.all([
      User.findById(req.params.userId).select('followers'),
      User.findById(req.user.id).select('following')
    ]);
    const targetCounts = await resolveFollowCounts(
      req.params.userId,
      Array.isArray(updatedTarget?.followers) ? updatedTarget.followers.length : 0,
      0
    );
    const currentCounts = await resolveFollowCounts(
      req.user.id,
      0,
      Array.isArray(updatedCurrent?.following) ? updatedCurrent.following.length : 0
    );

    res.json({
      success: true,
      message: 'User unfollowed successfully',
      isFollowing: false,
      followersCount: targetCounts.followersCount,
      followingCount: currentCounts.followingCount,
      targetUserId: String(req.params.userId),
      currentUserId: String(req.user.id)
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:userId/stats', protect, async (req, res) => {
  try {
    const [user, postCount, treeCount, scanCount] = await Promise.all([
      User.findById(req.params.userId).select('followers following'),
      CommunityPost.countDocuments({ user: req.params.userId, isDeleted: false }),
      Tree.countDocuments({ owner: req.params.userId }),
      Scan.countDocuments({ user: req.params.userId })
    ]);

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const followCounts = await resolveFollowCounts(
      req.params.userId,
      (user.followers || []).length,
      (user.following || []).length
    );

    res.json({
      success: true,
      data: {
        totalPosts: postCount,
        totalFollowers: followCounts.followersCount,
        totalFollowing: followCounts.followingCount,
        trees: treeCount,
        totalTrees: treeCount,
        scans: scanCount,
        followers: followCounts.followersCount,
        following: followCounts.followingCount
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/:userId/block', protect, async (req, res) => {
  try {
    if (String(req.params.userId) === String(req.user.id)) {
      return res.status(400).json({ success: false, error: 'Cannot block yourself' });
    }

    await Promise.all([
      User.findByIdAndUpdate(req.user.id, {
        $addToSet: { blockedUsers: req.params.userId },
        $pull: { followers: req.params.userId, following: req.params.userId }
      }),
      User.findByIdAndUpdate(req.params.userId, {
        $pull: { followers: req.user.id, following: req.user.id }
      })
    ]);

    res.json({ success: true, message: 'User blocked successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/:userId/unblock', protect, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, { $pull: { blockedUsers: req.params.userId } });
    res.json({ success: true, message: 'User unblocked successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:userId', protect, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .populate('followers', 'name email profileImage avatar profilePicture')
      .populate('following', 'name email profileImage avatar profilePicture');

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const [postCount, treeCount, scanCount] = await Promise.all([
      CommunityPost.countDocuments({ user: user._id, isDeleted: false }),
      Tree.countDocuments({ owner: user._id }),
      Scan.countDocuments({ user: user._id })
    ]);

    const followCollections = await getProfileFollowCollections(
      user._id,
      user.followers || [],
      user.following || []
    );

    const mapped = mapSimpleUser(user.toObject());
    const preferredProfileImage = followCollections.profileImage || mapped.profileImage;
    if (preferredProfileImage && !mapped.profileImage) {
      mapped.profileImage = preferredProfileImage;
      mapped.avatar = {
        ...(mapped.avatar || {}),
        url: preferredProfileImage
      };
      mapped.profilePicture = {
        ...(mapped.profilePicture || {}),
        url: preferredProfileImage
      };
    }

    const followCounts = await resolveFollowCounts(
      user._id,
      (followCollections.followers || []).length,
      (followCollections.following || []).length
    );

    const currentUserProfile = await UserProfile.findOne({ user: req.user.id }).select('following').lean();
    const isFollowingByProfile = Array.isArray(currentUserProfile?.following)
      && currentUserProfile.following.some((id) => String(id) === String(user._id));
    const isFollowingByUser = (user.followers || []).some((f) => String(f._id || f) === String(req.user.id));
    const isFollowing = Boolean(
      currentUserProfile
        ? isFollowingByProfile
        : isFollowingByUser
    );

    res.json({
      success: true,
      data: {
        ...mapped,
        bio: user.bio || '',
        location: user.location || '',
        phoneNumber: user.phoneNumber || '',
        followers: (followCollections.followers || []).map(mapSimpleUser),
        following: (followCollections.following || []).map(mapSimpleUser),
        followersCount: followCounts.followersCount,
        followingCount: followCounts.followingCount,
        stats: {
          posts: postCount,
          totalPosts: postCount,
          trees: treeCount,
          totalTrees: treeCount,
          scans: scanCount,
          totalFollowers: followCounts.followersCount,
          totalFollowing: followCounts.followingCount,
          followers: followCounts.followersCount,
          following: followCounts.followingCount
        },
        isFollowing
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
