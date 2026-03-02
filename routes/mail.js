const express = require('express');

const router = express.Router();

const { protect } = require('../middleware/auth');
const Announcement = require('../models/Announcement');
const User = require('../models/User');

const toObjectIdString = (value) => {
  if (!value) return '';
  if (typeof value === 'object' && value._id) return String(value._id);
  return String(value);
};

const buildVisibleAnnouncementsQuery = (user = null) => {
  const now = new Date();
  const isAdmin = user?.role === 'admin';
  const subscription = user?.subscriptionType || 'free';

  const audience = ['all', subscription];
  if (isAdmin) {
    audience.push('admin', 'admins');
  } else {
    audience.push('user', 'users');
  }

  return {
    isPublished: true,
    publishDate: { $lte: now },
    targetAudience: { $in: audience },
    $or: [
      { expiryDate: { $exists: false } },
      { expiryDate: null },
      { expiryDate: { $gt: now } }
    ]
  };
};

router.get('/announcements', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('role subscriptionType');
    const query = buildVisibleAnnouncementsQuery(user);

    const announcements = await Announcement.find(query)
      .sort({
        isImportant: -1,
        priority: -1,
        publishDate: -1,
        createdAt: -1
      })
      .populate('createdBy', 'name')
      .limit(100);

    if (announcements.length > 0) {
      const userId = toObjectIdString(req.user.id);
      for (const item of announcements) {
        const alreadyViewed = Array.isArray(item.viewedBy) && item.viewedBy.some(
          (entry) => toObjectIdString(entry?.userId) === userId
        );

        if (!alreadyViewed) {
          item.viewedBy.push({ userId: req.user.id, viewedAt: new Date() });
          item.views = Number(item.views || 0) + 1;
          await item.save();
        }
      }
    }

    res.json({
      success: true,
      count: announcements.length,
      data: announcements
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/announcements/:id/read', protect, async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);
    if (!announcement) {
      return res.status(404).json({ success: false, error: 'Announcement not found' });
    }

    const userId = toObjectIdString(req.user.id);
    const alreadyRead = Array.isArray(announcement.readBy) && announcement.readBy.some(
      (entry) => toObjectIdString(entry?.userId) === userId
    );
    const alreadyViewed = Array.isArray(announcement.viewedBy) && announcement.viewedBy.some(
      (entry) => toObjectIdString(entry?.userId) === userId
    );

    if (!alreadyRead) {
      announcement.readBy.push({ userId: req.user.id, readAt: new Date() });
    }

    if (!alreadyViewed) {
      announcement.viewedBy.push({ userId: req.user.id, viewedAt: new Date() });
      announcement.views = Number(announcement.views || 0) + 1;
    }

    if (!alreadyRead || !alreadyViewed) {
      await announcement.save();
    }

    res.json({ success: true, message: 'Announcement marked as read' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/unread/count', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('role subscriptionType');
    const query = buildVisibleAnnouncementsQuery(user);

    const [totalCount, unreadCount] = await Promise.all([
      Announcement.countDocuments(query),
      Announcement.countDocuments({
        ...query,
        readBy: { $not: { $elemMatch: { userId: req.user.id } } }
      })
    ]);

    res.json({
      success: true,
      data: {
        unreadCount,
        totalCount
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/mark-all-read', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('role subscriptionType');
    const query = buildVisibleAnnouncementsQuery(user);

    const announcements = await Announcement.find({
      ...query,
      readBy: { $not: { $elemMatch: { userId: req.user.id } } }
    }).select('_id readBy viewedBy views');

    let updatedCount = 0;
    const userId = toObjectIdString(req.user.id);

    for (const item of announcements) {
      const alreadyRead = Array.isArray(item.readBy) && item.readBy.some(
        (entry) => toObjectIdString(entry?.userId) === userId
      );
      const alreadyViewed = Array.isArray(item.viewedBy) && item.viewedBy.some(
        (entry) => toObjectIdString(entry?.userId) === userId
      );

      if (!alreadyRead) {
        item.readBy.push({ userId: req.user.id, readAt: new Date() });
      }

      if (!alreadyViewed) {
        item.viewedBy.push({ userId: req.user.id, viewedAt: new Date() });
        item.views = Number(item.views || 0) + 1;
      }

      if (!alreadyRead || !alreadyViewed) {
        await item.save();
        updatedCount += 1;
      }
    }

    res.json({
      success: true,
      message: `Marked ${updatedCount} announcements as read`,
      data: { updatedCount }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
