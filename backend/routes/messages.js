const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Message = require('../models/Message');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

// @route   POST /api/messages
// @desc    Send a message
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const { receiverId, text } = req.body;

    if (!receiverId || !text) {
      return res.status(400).json({ error: 'Receiver and text are required' });
    }

    const newMessage = new Message({
      sender: req.user.id,
      receiver: receiverId,
      text
    });

    const savedMessage = await newMessage.save();
    
    // Populate sender info for immediate display
    await savedMessage.populate('sender', 'name profileImage');
    await savedMessage.populate('receiver', 'name profileImage');

    res.json(savedMessage);
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

    // Aggregate to find unique conversation partners and last message
    const conversations = await Message.aggregate([
      {
        $match: {
          $or: [
            { sender: new mongoose.Types.ObjectId(currentUserId) },
            { receiver: new mongoose.Types.ObjectId(currentUserId) }
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
              { $eq: ['$sender', new mongoose.Types.ObjectId(currentUserId)] },
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
          'user.verificationToken': 0
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

// @route   GET /api/messages/:userId
// @desc    Get messages between current user and another user
// @access  Private
router.get('/:userId', protect, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    const messages = await Message.find({
      $or: [
        { sender: currentUserId, receiver: userId },
        { sender: userId, receiver: currentUserId }
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
