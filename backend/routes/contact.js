const express = require('express');

const router = express.Router();

const { protect } = require('../middleware/auth');
const Contact = require('../models/Contact');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeSingleLine = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();
const normalizeMultiline = (value = '') => String(value || '').trim();

const asString = (value = '') => String(value || '');

const getClientIP = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || '';
};

const isOwnerOrAdmin = (contact, user) => {
  if (!contact || !user) return false;
  if (user.role === 'admin') return true;

  const contactUserId = contact.userId ? String(contact.userId) : '';
  const userId = user.id ? String(user.id) : String(user._id || '');
  const contactEmail = asString(contact.email).trim().toLowerCase();
  const userEmail = asString(user.email).trim().toLowerCase();

  return (contactUserId && userId && contactUserId === userId)
    || (contactEmail && userEmail && contactEmail === userEmail);
};

const sanitizeContact = (doc = {}) => {
  const contact = doc && typeof doc.toObject === 'function' ? doc.toObject() : { ...(doc || {}) };
  delete contact.__v;
  return contact;
};

router.post('/', protect, async (req, res) => {
  try {
    const fallbackName = normalizeSingleLine(req.user?.name || '');
    const fallbackEmail = asString(req.user?.email || '').trim().toLowerCase();

    const name = normalizeSingleLine(req.body?.name || fallbackName);
    const email = asString(req.body?.email || fallbackEmail).trim().toLowerCase();
    const subject = normalizeSingleLine(req.body?.subject || '');
    const message = normalizeMultiline(req.body?.message || '');

    if (!name) return res.status(400).json({ success: false, error: 'Name is required' });
    if (!email) return res.status(400).json({ success: false, error: 'Email is required' });
    if (!EMAIL_REGEX.test(email)) return res.status(400).json({ success: false, error: 'Please provide a valid email' });
    if (!subject) return res.status(400).json({ success: false, error: 'Subject is required' });
    if (!message) return res.status(400).json({ success: false, error: 'Message is required' });

    if (name.length > 100) return res.status(400).json({ success: false, error: 'Name cannot exceed 100 characters' });
    if (subject.length > 200) return res.status(400).json({ success: false, error: 'Subject cannot exceed 200 characters' });
    if (message.length > 5000) return res.status(400).json({ success: false, error: 'Message cannot exceed 5000 characters' });

    const created = await Contact.create({
      name,
      email,
      subject,
      message,
      userId: req.user.id,
      userIP: getClientIP(req),
      status: 'unread',
      isRead: false,
      readByUser: true,
      readByUserAt: new Date(),
      lastUserView: new Date(),
    });

    return res.status(201).json({
      success: true,
      message: 'Your message has been sent to support.',
      data: sanitizeContact(created),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to submit contact request',
    });
  }
});

router.get('/my', protect, async (req, res) => {
  try {
    const myEmail = asString(req.user?.email || '').trim().toLowerCase();
    const myId = req.user.id;

    const contacts = await Contact.find({
      $or: [
        { userId: myId },
        { email: myEmail },
      ],
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(100);

    return res.json({
      success: true,
      count: contacts.length,
      data: contacts.map(sanitizeContact),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch contact requests',
    });
  }
});

router.get('/:id', protect, async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    if (!contact) {
      return res.status(404).json({ success: false, error: 'Contact request not found' });
    }

    if (!isOwnerOrAdmin(contact, req.user)) {
      return res.status(403).json({ success: false, error: 'Not authorized to access this request' });
    }

    return res.json({ success: true, data: sanitizeContact(contact) });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch contact request',
    });
  }
});

router.post('/:id/reply', protect, async (req, res) => {
  try {
    const text = normalizeMultiline(req.body?.text || req.body?.message || '');
    if (!text) {
      return res.status(400).json({ success: false, error: 'Reply text is required' });
    }
    if (text.length > 5000) {
      return res.status(400).json({ success: false, error: 'Reply cannot exceed 5000 characters' });
    }

    const contact = await Contact.findById(req.params.id);
    if (!contact) {
      return res.status(404).json({ success: false, error: 'Contact request not found' });
    }

    if (!isOwnerOrAdmin(contact, req.user)) {
      return res.status(403).json({ success: false, error: 'Not authorized to reply to this request' });
    }

    contact.userReplies = Array.isArray(contact.userReplies) ? contact.userReplies : [];
    contact.userReplies.push({
      text,
      date: new Date(),
      userId: req.user.id,
      adminReplies: [],
      lastSeenByUser: new Date(),
    });
    contact.status = 'conversation';
    contact.readByUser = true;
    contact.readByUserAt = new Date();
    contact.lastUserView = new Date();

    await contact.save();

    return res.json({
      success: true,
      message: 'Reply sent successfully.',
      data: sanitizeContact(contact),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to send reply',
    });
  }
});

router.put('/:id/read', protect, async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    if (!contact) {
      return res.status(404).json({ success: false, error: 'Contact request not found' });
    }

    if (!isOwnerOrAdmin(contact, req.user)) {
      return res.status(403).json({ success: false, error: 'Not authorized to update this request' });
    }

    contact.readByUser = true;
    contact.readByUserAt = new Date();
    contact.lastUserView = new Date();

    if (Array.isArray(contact.userReplies)) {
      contact.userReplies.forEach((reply) => {
        if (Array.isArray(reply.adminReplies)) {
          reply.adminReplies.forEach((adminReply) => {
            if (!adminReply.readByUser) {
              adminReply.readByUser = true;
              adminReply.readByUserAt = new Date();
            }
          });
        }
      });
    }

    await contact.save();

    return res.json({
      success: true,
      message: 'Contact request marked as read.',
      data: sanitizeContact(contact),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to mark contact request as read',
    });
  }
});

module.exports = router;
