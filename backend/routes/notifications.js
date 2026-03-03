const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { isValidExpoPushToken, normalizePushToken } = require('../services/expoPush');

// @route   GET /api/notifications
// @desc    Get all notifications for the current user
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const notifications = await Notification.find({ recipient: req.user.id })
      .populate('sender', 'name profileImage avatar profilePicture email')
      .populate('post', 'title')
      .populate('comment', 'content')
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({
      success: true,
      data: notifications
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// @route   GET /api/notifications/unread
// @desc    Get unread notifications count
// @access  Private
router.get('/unread', protect, async (req, res) => {
  try {
    const unreadCount = await Notification.countDocuments({
      recipient: req.user.id,
      isRead: false
    });

    res.json({
      success: true,
      unreadCount
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// @route   POST /api/notifications/push-token
// @desc    Register or refresh device push token for current user
// @access  Private
router.post('/push-token', protect, async (req, res) => {
  try {
    const token = normalizePushToken(req.body?.token);
    if (!token || !isValidExpoPushToken(token)) {
      return res.status(400).json({ success: false, error: 'Valid Expo push token is required' });
    }

    const platformRaw = String(req.body?.platform || '').trim().toLowerCase();
    const platform = ['android', 'ios', 'web'].includes(platformRaw) ? platformRaw : 'unknown';
    const deviceId = req.body?.deviceId ? String(req.body.deviceId).trim() : '';
    const appVersion = req.body?.appVersion ? String(req.body.appVersion).trim() : '';
    const now = new Date();

    const user = await User.findById(req.user.id).select('pushTokens');
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const existing = Array.isArray(user.pushTokens) ? user.pushTokens : [];
    const nextTokens = existing.filter((item) => normalizePushToken(item?.token) !== token);
    nextTokens.push({
      token,
      platform,
      deviceId,
      appVersion,
      lastSeenAt: now,
      createdAt: now
    });

    user.pushTokens = nextTokens.slice(-10);
    await user.save();

    res.json({
      success: true,
      message: 'Push token registered',
      data: { count: user.pushTokens.length }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// @route   DELETE /api/notifications/push-token
// @desc    Remove device push token for current user
// @access  Private
router.delete('/push-token', protect, async (req, res) => {
  try {
    const token = normalizePushToken(req.body?.token || req.query?.token);
    if (!token) {
      return res.status(400).json({ success: false, error: 'Push token is required' });
    }

    await User.updateOne(
      { _id: req.user.id },
      { $pull: { pushTokens: { token } } }
    );

    res.json({ success: true, message: 'Push token removed' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// @route   PUT /api/notifications/:id/read
// @desc    Mark notification as read
// @access  Private
router.put('/:id/read', protect, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user.id },
      { isRead: true },
      { new: true }
    )
      .populate('sender', 'name profileImage avatar profilePicture email')
      .populate('post', 'title')
      .populate('comment', 'content');

    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    res.json({
      success: true,
      data: notification
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// @route   PUT /api/notifications/mark-all-read
// @desc    Mark all notifications as read
// @access  Private
router.put('/mark-all-read', protect, async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user.id, isRead: false },
      { isRead: true }
    );

    res.json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// @route   DELETE /api/notifications/:id
// @desc    Delete a notification
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      recipient: req.user.id
    });

    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    res.json({
      success: true,
      message: 'Notification deleted'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
