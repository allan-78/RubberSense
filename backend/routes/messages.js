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
const { sendPushToUser } = require('../services/expoPush');

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

const normalizeProfileImage = (user) => {
  if (!user || typeof user !== 'object') return null;
  return user.profileImage || user.avatar?.url || user.profilePicture?.url || null;
};

const normalizeUser = (user) => {
  if (!user) return null;
  if (typeof user !== 'object') {
    return { _id: user, name: 'User', profileImage: null };
  }

  return {
    ...user,
    _id: user._id || user.id,
    profileImage: normalizeProfileImage(user),
  };
};

const normalizeRequestStatus = (msg) => {
  if (['accepted', 'pending', 'rejected'].includes(msg?.requestStatus)) {
    return msg.requestStatus;
  }

  const status = String(msg?.status || '').toLowerCase();
  if (status === 'rejected') return 'rejected';
  if (status === 'pending') return 'pending';
  if (msg?.isRequest === true && status !== 'accepted') return 'pending';

  return 'accepted';
};

const normalizeMessage = (msg) => {
  const sender = normalizeUser(msg?.sender);
  const receiver = normalizeUser(msg?.receiver || msg?.recipient);
  const requestStatus = normalizeRequestStatus(msg);
  const rawText = (typeof msg?.text === 'string' && msg.text.length > 0)
    ? msg.text
    : (msg?.content || '');
  const isDeleted = Boolean(msg?.isDeleted);
  const text = isDeleted ? 'This message was deleted' : rawText;

  return {
    ...msg,
    sender,
    receiver,
    recipient: receiver,
    text,
    content: text,
    attachments: isDeleted ? [] : (Array.isArray(msg?.attachments) ? msg.attachments : []),
    isDeleted,
    deletedAt: msg?.deletedAt || null,
    deletedBy: msg?.deletedBy || null,
    requestStatus,
    status: msg?.status || (requestStatus === 'pending' ? 'pending' : 'sent'),
    isRequest: typeof msg?.isRequest === 'boolean' ? msg.isRequest : requestStatus === 'pending',
    read: !!msg?.isRead,
  };
};

const isVisibleToUser = (msg, userId) => {
  const currentId = String(userId);
  const senderId = normalizeObjectId(msg?.sender);
  const receiverId = normalizeObjectId(msg?.receiver || msg?.recipient);

  if (senderId === currentId && msg?.isDeletedBySender) return false;
  if (receiverId === currentId && msg?.isDeletedByRecipient) return false;
  return true;
};

const isBlockedBetweenUsers = (currentUser, otherUser, currentUserId, otherUserId) => {
  const blockedByCurrent = Array.isArray(currentUser?.blockedUsers)
    && currentUser.blockedUsers.some(id => normalizeObjectId(id) === String(otherUserId));
  const blockedCurrent = Array.isArray(otherUser?.blockedUsers)
    && otherUser.blockedUsers.some(id => normalizeObjectId(id) === String(currentUserId));
  return { blockedByCurrent, blockedCurrent };
};

const getConversationQuery = (userA, userB) => ({
  $or: [
    {
      sender: userA,
      $or: [{ receiver: userB }, { recipient: userB }]
    },
    {
      sender: userB,
      $or: [{ receiver: userA }, { recipient: userA }]
    }
  ]
});

const fetchConversationMessages = async (userA, userB) => {
  return Message.find(getConversationQuery(userA, userB))
    .sort({ createdAt: 1 })
    .populate('sender', 'name profileImage avatar profilePicture')
    .populate('receiver', 'name profileImage avatar profilePicture')
    .populate('recipient', 'name profileImage avatar profilePicture')
    .lean();
};

const getReceiverIdFromBody = (body = {}) => {
  return body.receiverId || body.recipientId || null;
};

const getTextFromBody = (body = {}) => {
  if (typeof body.text === 'string') return body.text;
  if (typeof body.content === 'string') return body.content;
  return '';
};

// @route   POST /api/messages
// @desc    Send a message
// @access  Private
const sendMessageHandler = async (req, res) => {
  try {
    const receiverId = getReceiverIdFromBody(req.body);
    const text = getTextFromBody(req.body);

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

    const thread = await fetchConversationMessages(req.user.id, receiverId);
    const hasAcceptedConversation = thread
      .filter(msg => isVisibleToUser(msg, req.user.id) || isVisibleToUser(msg, receiverId))
      .some(msg => normalizeRequestStatus(msg) === 'accepted');

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
      recipient: receiverId,
      text: text || '',
      content: text || '',
      attachments: attachmentsData,
      requestStatus,
      status: requestStatus === 'pending' ? 'pending' : 'sent',
      isRequest: requestStatus === 'pending'
    });

    const savedMessage = await newMessage.save();

    await savedMessage.populate('sender', 'name profileImage avatar profilePicture');
    await savedMessage.populate('receiver', 'name profileImage avatar profilePicture');

    const payload = {
      ...normalizeMessage(savedMessage.toObject()),
      isRequestPending: requestStatus === 'pending'
    };

    emitToUser(receiverId, 'message:new', payload);
    emitToUser(req.user.id, 'message:new', payload);

    const senderName = savedMessage?.sender?.name || 'Someone';
    const previewText = (text || '').trim();
    const hasAttachments = Array.isArray(savedMessage?.attachments) && savedMessage.attachments.length > 0;
    const pushBody = previewText
      ? `${senderName}: ${previewText.slice(0, 120)}`
      : hasAttachments
        ? `${senderName} sent an attachment`
        : `${senderName} sent you a message`;
    const pushTitle = requestStatus === 'pending' ? 'New Message Request' : 'New Message';

    try {
      await sendPushToUser(receiverId, {
        title: pushTitle,
        body: pushBody,
        data: {
          type: requestStatus === 'pending' ? 'message_request' : 'message',
          senderId: String(req.user.id),
          receiverId: String(receiverId),
          messageId: String(savedMessage._id)
        }
      });
    } catch (pushError) {
      console.error('Failed to send message push:', pushError?.message || pushError);
    }

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
};

router.post('/', protect, upload.array('files', 10), sendMessageHandler);
router.post('/send', protect, upload.array('files', 10), sendMessageHandler);

// @route   GET /api/messages/conversations
// @desc    Get list of conversations (users communicated with)
// @access  Private
router.get('/conversations', protect, async (req, res) => {
  try {
    const currentUserId = String(req.user.id);

    const rawMessages = await Message.find({
      $or: [
        { sender: req.user.id },
        { receiver: req.user.id },
        { recipient: req.user.id }
      ]
    })
      .sort({ createdAt: -1 })
      .populate('sender', 'name profileImage avatar profilePicture')
      .populate('receiver', 'name profileImage avatar profilePicture')
      .populate('recipient', 'name profileImage avatar profilePicture')
      .lean();

    const conversations = new Map();

    for (const msg of rawMessages) {
      const normalized = normalizeMessage(msg);
      if (!isVisibleToUser(normalized, currentUserId)) continue;
      if (normalized.requestStatus === 'rejected') continue;

      const senderId = normalizeObjectId(normalized.sender);
      const receiverId = normalizeObjectId(normalized.receiver);
      const isIncomingPending = receiverId === currentUserId && normalized.requestStatus === 'pending';

      // Keep pending incoming messages in message requests, not in normal conversations list.
      if (isIncomingPending) continue;

      const otherUser = senderId === currentUserId ? normalized.receiver : normalized.sender;
      const otherUserId = normalizeObjectId(otherUser);
      if (!otherUserId) continue;

      if (!conversations.has(otherUserId)) {
        conversations.set(otherUserId, {
          _id: otherUserId,
          user: otherUser,
          lastMessage: normalized
        });
      }
    }

    const list = Array.from(conversations.values()).sort((a, b) => {
      const da = new Date(a.lastMessage?.createdAt || 0).getTime();
      const db = new Date(b.lastMessage?.createdAt || 0).getTime();
      return db - da;
    });

    res.json(list);
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/messages/requests
// @desc    Get incoming pending message requests
// @access  Private
router.get('/requests', protect, async (req, res) => {
  try {
    const currentUserId = String(req.user.id);

    const rawMessages = await Message.find({
      sender: { $ne: req.user.id },
      $or: [
        { receiver: req.user.id },
        { recipient: req.user.id }
      ]
    })
      .sort({ createdAt: -1 })
      .populate('sender', 'name profileImage avatar profilePicture')
      .populate('receiver', 'name profileImage avatar profilePicture')
      .populate('recipient', 'name profileImage avatar profilePicture')
      .lean();

    const grouped = new Map();

    for (const msg of rawMessages) {
      const normalized = normalizeMessage(msg);
      if (!isVisibleToUser(normalized, currentUserId)) continue;
      if (normalized.requestStatus !== 'pending') continue;

      const receiverId = normalizeObjectId(normalized.receiver);
      if (receiverId !== currentUserId) continue;

      const sender = normalized.sender;
      const senderId = normalizeObjectId(sender);
      if (!senderId) continue;

      if (!grouped.has(senderId)) {
        grouped.set(senderId, {
          _id: senderId,
          user: sender,
          lastMessage: normalized,
          pendingCount: 1
        });
      } else {
        grouped.get(senderId).pendingCount += 1;
      }
    }

    const requests = Array.from(grouped.values()).sort((a, b) => {
      const da = new Date(a.lastMessage?.createdAt || 0).getTime();
      const db = new Date(b.lastMessage?.createdAt || 0).getTime();
      return db - da;
    });

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

    const thread = await fetchConversationMessages(currentUserId, otherUserId);
    const visible = thread.filter(msg => isVisibleToUser(msg, currentUserId));

    const pendingIncoming = visible.some(msg => {
      const normalized = normalizeMessage(msg);
      return normalizeObjectId(normalized.sender) === String(otherUserId)
        && normalizeObjectId(normalized.receiver) === String(currentUserId)
        && normalized.requestStatus === 'pending';
    });

    const pendingOutgoing = visible.some(msg => {
      const normalized = normalizeMessage(msg);
      return normalizeObjectId(normalized.sender) === String(currentUserId)
        && normalizeObjectId(normalized.receiver) === String(otherUserId)
        && normalized.requestStatus === 'pending';
    });

    const acceptedConversation = visible.some(msg => normalizeMessage(msg).requestStatus === 'accepted');

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

    const candidateMessages = await Message.find({
      sender: senderId,
      $or: [
        { receiver: req.user.id },
        { recipient: req.user.id }
      ]
    }).select('_id sender receiver recipient requestStatus status isRequest').lean();

    const targetIds = candidateMessages
      .filter(msg => normalizeRequestStatus(msg) === 'pending')
      .map(msg => msg._id);

    if (targetIds.length === 0) {
      return res.json({ success: true, action, updatedCount: 0 });
    }

    const update = action === 'accept'
      ? { $set: { requestStatus: 'accepted', status: 'accepted', isRequest: false } }
      : { $set: { requestStatus: 'rejected', status: 'rejected' } };

    const result = await Message.updateMany({ _id: { $in: targetIds } }, update);

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

// @route   DELETE /api/messages/:messageId
// @desc    Delete message (sender: delete for everyone, receiver: delete for me)
// @access  Private
router.delete('/:messageId', protect, async (req, res) => {
  try {
    const { messageId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ success: false, error: 'Invalid message id' });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    const currentUserId = String(req.user.id);
    const senderId = normalizeObjectId(message.sender);
    const receiverId = normalizeObjectId(message.receiver || message.recipient);

    const isParticipant = senderId === currentUserId || receiverId === currentUserId;
    if (!isParticipant) {
      return res.status(403).json({ success: false, error: 'Not allowed to delete this message' });
    }

    const isSenderDeletingOwnMessage = senderId === currentUserId;
    if (isSenderDeletingOwnMessage) {
      if (!message.isDeleted) {
        message.isDeleted = true;
        message.deletedAt = new Date();
        message.deletedBy = req.user.id;
        message.text = '';
        message.content = '';
        message.attachments = [];
      }

      // Keep globally deleted message visible for both participants.
      message.isDeletedBySender = false;
      message.isDeletedByRecipient = false;
      await message.save();

      const payload = {
        messageId: String(message._id),
        deletedForEveryone: true,
        text: 'This message was deleted',
        deletedAt: message.deletedAt,
      };

      emitToUser(senderId, 'message:deleted', payload);
      if (receiverId) {
        emitToUser(receiverId, 'message:deleted', payload);
      }

      return res.json({
        success: true,
        data: payload
      });
    }

    if (receiverId === currentUserId) {
      message.isDeletedByRecipient = true;
      await message.save();
    }

    emitToUser(currentUserId, 'message:deleted', {
      messageId: String(message._id),
      deletedForMe: true
    });

    res.json({
      success: true,
      data: {
        messageId: String(message._id),
        deletedForMe: true
      }
    });
  } catch (error) {
    console.error('Delete message error:', error);
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
        $or: [
          { receiver: currentUserId },
          { recipient: currentUserId }
        ],
        isRead: false
      },
      { $set: { isRead: true } }
    );

    const rawMessages = await fetchConversationMessages(currentUserId, userId);

    const messages = rawMessages
      .filter(msg => isVisibleToUser(msg, currentUserId))
      .map(normalizeMessage)
      .filter(msg => msg.requestStatus !== 'rejected')
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    res.json(messages);
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
