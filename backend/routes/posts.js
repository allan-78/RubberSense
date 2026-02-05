const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const { protect } = require('../middleware/auth');

// @route   GET /api/posts
// @desc    Get all posts
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const posts = await Post.find()
      .populate('user', 'name profileImage')
      .populate('comments.user', 'name profileImage')
      .populate('comments.replies.user', 'name profileImage')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: posts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// @route   POST /api/posts
// @desc    Create a post
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const { title, content, image } = req.body;
    
    const post = await Post.create({
      user: req.user.id,
      title,
      content,
      image
    });
    
    // Populate user info to return immediately
    await post.populate('user', 'name profileImage');

    res.status(201).json({ success: true, data: post });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// @route   GET /api/posts/my-posts
// @desc    Get current user posts (for profile stats)
// @access  Private
router.get('/my-posts', protect, async (req, res) => {
  try {
    const posts = await Post.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json({ success: true, count: posts.length, data: posts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// @route   PUT /api/posts/:id/like
// @desc    Like a post
// @access  Private
router.put('/:id/like', protect, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    // Check if post has already been liked
    const isLiked = post.likes.some(id => id.toString() === req.user.id);

    if (isLiked) {
      // Unlike - atomic pull
      await Post.findByIdAndUpdate(req.params.id, { $pull: { likes: req.user.id } });
    } else {
      // Like - atomic addToSet (prevents duplicates at DB layer)
      await Post.findByIdAndUpdate(req.params.id, { $addToSet: { likes: req.user.id } });
    }

    // Fetch updated post to get likes array
    const updatedPost = await Post.findById(req.params.id);
    res.json({ success: true, data: updatedPost.likes });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// @route   POST /api/posts/:id/comment
// @desc    Comment on a post
// @access  Private
router.post('/:id/comment', protect, async (req, res) => {
  try {
    const { text } = req.body;
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    const newComment = {
      user: req.user.id,
      text,
      name: req.user.name,
      avatar: req.user.profileImage
    };

    post.comments.push(newComment);

    await post.save();

    // Populate comments user info to return immediately
    await post.populate('comments.user', 'name profileImage');
    await post.populate('comments.replies.user', 'name profileImage');

    res.json({ success: true, data: post.comments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// @route   POST /api/posts/:id/comment/:commentId/reply
// @desc    Reply to a comment
// @access  Private
router.post('/:id/comment/:commentId/reply', protect, async (req, res) => {
  try {
    const { text } = req.body;
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    const comment = post.comments.id(req.params.commentId);
    if (!comment) {
      return res.status(404).json({ success: false, error: 'Comment not found' });
    }

    const newReply = {
      user: req.user.id,
      text,
      name: req.user.name,
      avatar: req.user.profileImage
    };

    comment.replies.push(newReply);
    await post.save();

    // Populate user info
    await post.populate('comments.replies.user', 'name profileImage');

    // Return the updated comments array (or just the specific comment if optimized)
    // For simplicity, return all comments to refresh the view
    await post.populate('comments.user', 'name profileImage');

    res.json({ success: true, data: post.comments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
