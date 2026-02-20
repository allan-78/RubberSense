const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Message = require('../models/Message');
const User = require('../models/User');
const { emitToUser } = require('../socket');
const { protect } = require('../middleware/auth');
const fs = require('fs');
const upload = require('../middleware/upload');
const { uploadToCloudinary } = require('../config/cloudinary');

const uploadAttachments = async (files, folder) => {
  if (!files || files.length === 0) return [];
  const uploaded = await Promise.all(
    files.map(async (file) => {
      const result = await uploadToCloudinary(file, folder);
      fs.unlinkSync(file.path);
      return {
        url: result.url,
        publicId: result.publicId,
        name: file.originalname,
        type: file.mimetype,
        size: file.size
      };
    })
  );
  return uploaded;
};

const normalizeObjectId = (val) => String(val?._id || val || '');

const isBlockedBetweenUsers = (currentUser, otherUser, currentUserId, otherUserId) => {
  const blockedByCurrent = Array.isArray(currentUser?.blockedUsers)
    && currentUser.blockedUsers.some(id => normalizeObjectId(id) === String(otherUserId));
  const blockedCurrent = Array.isArray(otherUser?.blockedUsers)
    && otherUser.blockedUsers.some(id => normalizeObjectId(id) === String(currentUserId));
  return { blockedByCurrent, blockedCurrent };
};

// @route   POST /api/messages
// @desc    Send a message
// @access  Private
router.post('/', protect, upload.array('files', 10), async (req, res) => {
  try {
    const { receiverId, text } = req.body;
    
    // Check if there are files or text
    if (!receiverId || (!text && (!req.files || req.files.length === 0))) {
      return res.status(400).json({ error: 'Receiver and content (text or files) are required' });
    }

    if (String(receiverId) === String(req.user.id)) {
      return res.status(400).json({ error: 'Cannot message yourself' });
    }

    const [senderUser, receiverUser] = await Promise.all([
      User.findById(req.user.id).select('following blockedUsers'),
      User.findById(receiverId).select('followers blockedUsers')
    ]);

    if (!senderUser || !receiverUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { blockedByCurrent, blockedCurrent } = isBlockedBetweenUsers(senderUser, receiverUser, req.user.id, receiverId);
    if (blockedByCurrent) {
      return res.status(403).json({ error: 'You blocked this user. Unblock to send messages.' });
    }
    if (blockedCurrent) {
      return res.status(403).json({ error: 'You cannot message this user.' });
    }

    const hasAcceptedConversation = await Message.exists({
      $and: [
        {
          $or: [
            { sender: req.user.id, receiver: receiverId },
            { sender: receiverId, receiver: req.user.id }
          ]
        },
        {
          $or: [
            { requestStatus: 'accepted' },
            { requestStatus: { $exists: false } }
          ]
        }
      ]
    });

    const senderFollowsReceiver = Array.isArray(senderUser.following)
      && senderUser.following.some(id => String(id) === String(receiverId));
    const receiverFollowsSender = Array.isArray(receiverUser.followers)
      && receiverUser.followers.some(id => String(id) === String(req.user.id));

    const shouldBePending = !hasAcceptedConversation && !senderFollowsReceiver && !receiverFollowsSender;
    const requestStatus = shouldBePending ? 'pending' : 'accepted';

    let attachmentsData = [];
    if (req.files && req.files.length > 0) {
       attachmentsData = await uploadAttachments(req.files, 'rubbersense/messages');
    }

    const newMessage = new Message({
      sender: req.user.id,
      receiver: receiverId,
      text: text || '',
      attachments: attachmentsData,
      requestStatus
    });

    const savedMessage = await newMessage.save();
    
    // Populate sender info for immediate display
    await savedMessage.populate('sender', 'name profileImage');
    await savedMessage.populate('receiver', 'name profileImage');

    const payload = {
      ...savedMessage.toObject(),
      isRequestPending: requestStatus === 'pending'
    };

    emitToUser(receiverId, 'message:new', payload);
    emitToUser(req.user.id, 'message:new', payload);

    if (requestStatus === 'pending') {
      emitToUser(receiverId, 'message:request', {
        senderId: req.user.id,
        receiverId,
        messageId: savedMessage._id,
      });
    }

    res.json(payload);
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/messages/conversations
// @desc    Get list of conversations (users communicated with)
// @access  Private
router.get('/conversations', protect, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const currentUserObjId = new mongoose.Types.ObjectId(currentUserId);

    // Aggregate to find unique conversation partners and last message
    const conversations = await Message.aggregate([
      {
        $match: {
          $and: [
            {
              $or: [
                { sender: currentUserObjId },
                { receiver: currentUserObjId }
              ]
            },
            {
              $or: [
                { requestStatus: { $exists: false } },
                { requestStatus: { $ne: 'rejected' } }
              ]
            },
            {
              $or: [
                { receiver: { $ne: currentUserObjId } },
                { requestStatus: { $ne: 'pending' } }
              ]
            }
          ]
        }
      },
      {
        $sort: { createdAt: -1 }
      },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ['$sender', currentUserObjId] },
              '$receiver',
              '$sender'
            ]
          },
          lastMessage: { $first: '$$ROOT' }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $project: {
          'user.password': 0,
          'user.verificationToken': 0,
          'user.blockedUsers': 0
        }
      },
      {
        $sort: { 'lastMessage.createdAt': -1 }
      }
    ]);

    res.json(conversations);
  } catch (error) {
    console.error('Get conversations error:', error);
    // Fallback: simple distinct if aggregation fails (or just return empty)
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/messages/requests
// @desc    Get incoming pending message requests
// @access  Private
router.get('/requests', protect, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const currentUserObjId = new mongoose.Types.ObjectId(currentUserId);

    const requests = await Message.aggregate([
      {
        $match: {
          receiver: currentUserObjId,
          requestStatus: 'pending'
        }
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$sender',
          lastMessage: { $first: '$$ROOT' },
          pendingCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      {
        $project: {
          'user.password': 0,
          'user.verificationToken': 0,
          'user.blockedUsers': 0
        }
      },
      { $sort: { 'lastMessage.createdAt': -1 } }
    ]);

    res.json({ success: true, data: requests });
  } catch (error) {
    console.error('Get message requests error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// @route   GET /api/messages/status/:userId
// @desc    Get chat status for direct message workflow
// @access  Private
router.get('/status/:userId', protect, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const otherUserId = req.params.userId;

    const [currentUser, otherUser] = await Promise.all([
      User.findById(currentUserId).select('blockedUsers'),
      User.findById(otherUserId).select('blockedUsers')
    ]);

    if (!currentUser || !otherUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const { blockedByCurrent, blockedCurrent } = isBlockedBetweenUsers(currentUser, otherUser, currentUserId, otherUserId);

    if (blockedByCurrent) {
      return res.json({
        success: true,
        data: {
          status: 'blocked_by_me',
          canMessage: false,
          blockedByMe: true,
          blockedMe: false
        }
      });
    }

    if (blockedCurrent) {
      return res.json({
        success: true,
        data: {
          status: 'blocked_me',
          canMessage: false,
          blockedByMe: false,
          blockedMe: true
        }
      });
    }

    const [pendingIncoming, pendingOutgoing, acceptedConversation] = await Promise.all([
      Message.exists({ sender: otherUserId, receiver: currentUserId, requestStatus: 'pending' }),
      Message.exists({ sender: currentUserId, receiver: otherUserId, requestStatus: 'pending' }),
      Message.exists({
        $and: [
          {
            $or: [
              { sender: currentUserId, receiver: otherUserId },
              { sender: otherUserId, receiver: currentUserId }
            ]
          },
          {
            $or: [
              { requestStatus: 'accepted' },
              { requestStatus: { $exists: false } }
            ]
          }
        ]
      })
    ]);

    let status = 'none';
    if (pendingIncoming) status = 'pending_incoming';
    else if (pendingOutgoing) status = 'pending_outgoing';
    else if (acceptedConversation) status = 'accepted';

    res.json({
      success: true,
      data: {
        status,
        canMessage: !['pending_incoming', 'pending_outgoing'].includes(status),
        blockedByMe: false,
        blockedMe: false
      }
    });
  } catch (error) {
    console.error('Get message status error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// @route   PUT /api/messages/requests/:senderId
// @desc    Accept or reject incoming message request
// @access  Private
router.put('/requests/:senderId', protect, async (req, res) => {
  try {
    const { senderId } = req.params;
    const { action } = req.body || {};

    if (!['accept', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, error: 'Invalid action' });
    }

    const filter = {
      sender: senderId,
      receiver: req.user.id,
      requestStatus: 'pending'
    };

    const update = action === 'accept'
      ? { $set: { requestStatus: 'accepted' } }
      : { $set: { requestStatus: 'rejected' } };

    const result = await Message.updateMany(filter, update);

    const payload = {
      senderId,
      receiverId: req.user.id,
      action,
      status: action === 'accept' ? 'accepted' : 'rejected',
      updatedCount: result.modifiedCount || 0,
    };
    emitToUser(senderId, 'message:request-updated', payload);
    emitToUser(req.user.id, 'message:request-updated', payload);

    res.json({
      success: true,
      action,
      updatedCount: result.modifiedCount || 0
    });
  } catch (error) {
    console.error('Respond to message request error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// @route   GET /api/messages/:userId
// @desc    Get messages between current user and another user
// @access  Private
router.get('/:userId', protect, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    await Message.updateMany(
      {
        sender: userId,
        receiver: currentUserId,
        isRead: false
      },
      { $set: { isRead: true } }
    );

    const messages = await Message.find({
      $and: [
        {
          $or: [
            { sender: currentUserId, receiver: userId },
            { sender: userId, receiver: currentUserId }
          ]
        },
        {
          $or: [
            { requestStatus: { $exists: false } },
            { requestStatus: { $ne: 'rejected' } }
          ]
        }
      ]
    })
    .sort({ createdAt: 1 }) // Oldest first
    .populate('sender', 'name profileImage')
    .populate('receiver', 'name profileImage');

    res.json(messages);
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
