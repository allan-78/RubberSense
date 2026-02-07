const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const { protect } = require('../middleware/auth');
const fs = require('fs');
const upload = require('../middleware/upload');
const { uploadToCloudinary } = require('../config/cloudinary');

if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

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

const withUploadArray = (field, max, handler) => {
  return (req, res, next) => {
    upload.array(field, max)(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ success: false, error: err.message });
      }
      try {
        await handler(req, res, next);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
  };
};

// @route   GET /api/posts
// @desc    Get all posts
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const posts = await Post.find()
      .populate('user', 'name profileImage')
      .populate('likes', 'name profileImage')
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
router.post('/', protect, withUploadArray('files', 10, async (req, res) => {
  try {
    const { title, content, image } = req.body;
    const attachmentsData = await uploadAttachments(req.files, 'rubbersense/posts');
    const finalTitle = title || (attachmentsData.length > 0 ? 'Media Post' : title);
    const finalContent = content || (attachmentsData.length > 0 ? 'Media post' : content);
    const imageUrl = image || attachmentsData[0]?.url || null;

    try {
      const post = await Post.create({
        user: req.user.id,
        title: finalTitle,
        content: finalContent,
        image: imageUrl,
        attachments: attachmentsData
      });
      await post.populate('user', 'name profileImage');
      return res.status(201).json({ success: true, data: post });
    } catch (err) {
      // Fallback to legacy schema (attachments: [string])
      const legacyAttachments = attachmentsData.map(a => a.url);
      const post = await Post.create({
        user: req.user.id,
        title: finalTitle,
        content: finalContent,
        image: imageUrl,
        attachments: legacyAttachments
      });
      await post.populate('user', 'name profileImage');
      return res.status(201).json({ success: true, data: post, legacy: true });
    }
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
}));

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
    const updatedPost = await Post.findById(req.params.id).populate('likes', 'name profileImage');
    res.json({ success: true, data: updatedPost.likes });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// @route   POST /api/posts/:id/comment
// @desc    Comment on a post
// @access  Private
router.post('/:id/comment', protect, withUploadArray('files', 10, async (req, res) => {
  try {
    const { text } = req.body;
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    const attachmentsData = await uploadAttachments(req.files, 'rubbersense/comments');
    let newComment = {
      user: req.user.id,
      text,
      name: req.user.name,
      avatar: req.user.profileImage,
      attachments: attachmentsData
    };

    try {
      post.comments.push(newComment);
      await post.save();
    } catch (err) {
      // Fallback to legacy schema
      newComment.attachments = attachmentsData.map(a => a.url);
      post.comments.push(newComment);
      await post.save();
    }

    // Populate comments user info to return immediately
    await post.populate('comments.user', 'name profileImage');
    await post.populate('comments.replies.user', 'name profileImage');

    res.json({ success: true, data: post.comments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}));

// @route   POST /api/posts/:id/comment/:commentId/reply
// @desc    Reply to a comment
// @access  Private
router.post('/:id/comment/:commentId/reply', protect, withUploadArray('files', 10, async (req, res) => {
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

    const attachmentsData = await uploadAttachments(req.files, 'rubbersense/replies');
    let newReply = {
      user: req.user.id,
      text,
      name: req.user.name,
      avatar: req.user.profileImage,
      attachments: attachmentsData
    };

    try {
      comment.replies.push(newReply);
      await post.save();
    } catch (err) {
      // Fallback to legacy schema
      newReply.attachments = attachmentsData.map(a => a.url);
      comment.replies.push(newReply);
      await post.save();
    }

    // Populate user info
    await post.populate('comments.replies.user', 'name profileImage');

    // Return the updated comments array (or just the specific comment if optimized)
    // For simplicity, return all comments to refresh the view
    await post.populate('comments.user', 'name profileImage');

    res.json({ success: true, data: post.comments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}));

router.put('/:id', protect, withUploadArray('files', 10, async (req, res) => {
  try {
    const { title, content } = req.body;
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }
    if (post.user.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    if (title !== undefined) post.title = title;
    if (content !== undefined) post.content = content;

    let keepAttachments = [];
    if (req.body.keepAttachments !== undefined) {
      if (typeof req.body.keepAttachments === 'string') {
        try {
          keepAttachments = JSON.parse(req.body.keepAttachments);
        } catch {
          keepAttachments = [req.body.keepAttachments];
        }
      } else if (Array.isArray(req.body.keepAttachments)) {
        keepAttachments = req.body.keepAttachments;
      }
      
      const keepKeys = new Set(
        keepAttachments
          .map(att => (typeof att === 'string' ? att : (att.url || att.publicId || att.name)))
          .filter(Boolean)
      );

      let nextAttachments = post.attachments || [];
      nextAttachments = nextAttachments.filter(att => {
        const key = typeof att === 'string' ? att : (att.url || att.publicId || att.name);
        return key && keepKeys.has(key);
      });
      post.attachments = nextAttachments;
    }

    if (req.files && req.files.length > 0) {
      const uploaded = await uploadAttachments(req.files, 'rubbersense/posts');
      post.attachments = [...(post.attachments || []), ...uploaded];
    }

    if (post.image && req.body.keepAttachments !== undefined) {
      // Re-evaluate cover image if attachments changed
      const keepKeys = new Set(
        keepAttachments
          .map(att => (typeof att === 'string' ? att : (att.url || att.publicId || att.name)))
          .filter(Boolean)
      );
      const imageKey = typeof post.image === 'string' ? post.image : '';
      if (imageKey && !keepKeys.has(imageKey)) {
        const first = post.attachments[0];
        post.image = typeof first === 'string' ? first : (first?.url || null);
      }
    }

    await post.save();
    await post.populate('user', 'name profileImage');
    res.json({ success: true, data: post });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}));

router.delete('/:id', protect, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }
    if (post.user.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    await post.deleteOne();
    res.json({ success: true, data: req.params.id });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/:id/comment/:commentId', protect, withUploadArray('files', 10, async (req, res) => {
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
    if (comment.user.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    if (text !== undefined) comment.text = text;

    let keepAttachments = [];
    if (req.body.keepAttachments !== undefined) {
      if (typeof req.body.keepAttachments === 'string') {
        try {
          keepAttachments = JSON.parse(req.body.keepAttachments);
        } catch {
          keepAttachments = [req.body.keepAttachments];
        }
      } else if (Array.isArray(req.body.keepAttachments)) {
        keepAttachments = req.body.keepAttachments;
      }
      
      const keepKeys = new Set(
        keepAttachments
          .map(att => (typeof att === 'string' ? att : (att.url || att.publicId || att.name)))
          .filter(Boolean)
      );

      let nextAttachments = comment.attachments || [];
      nextAttachments = nextAttachments.filter(att => {
        const key = typeof att === 'string' ? att : (att.url || att.publicId || att.name);
        return key && keepKeys.has(key);
      });
      comment.attachments = nextAttachments;
    }

    if (req.files && req.files.length > 0) {
      const uploaded = await uploadAttachments(req.files, 'rubbersense/comments');
      comment.attachments = [...(comment.attachments || []), ...uploaded];
    }
    await post.save();
    await post.populate('comments.user', 'name profileImage');
    await post.populate('comments.replies.user', 'name profileImage');
    res.json({ success: true, data: post.comments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}));

router.delete('/:id/comment/:commentId', protect, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }
    const comment = post.comments.id(req.params.commentId);
    if (!comment) {
      return res.status(404).json({ success: false, error: 'Comment not found' });
    }
    if (comment.user.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    comment.deleteOne();
    await post.save();
    await post.populate('comments.user', 'name profileImage');
    await post.populate('comments.replies.user', 'name profileImage');
    res.json({ success: true, data: post.comments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/:id/comment/:commentId/reply/:replyId', protect, upload.array('files', 10), async (req, res) => {
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
    const reply = comment.replies.id(req.params.replyId);
    if (!reply) {
      return res.status(404).json({ success: false, error: 'Reply not found' });
    }
    if (reply.user.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    if (text !== undefined) reply.text = text;

    let keepAttachments = [];
    if (req.body.keepAttachments !== undefined) {
      if (typeof req.body.keepAttachments === 'string') {
        try {
          keepAttachments = JSON.parse(req.body.keepAttachments);
        } catch {
          keepAttachments = [req.body.keepAttachments];
        }
      } else if (Array.isArray(req.body.keepAttachments)) {
        keepAttachments = req.body.keepAttachments;
      }
      
      const keepKeys = new Set(
        keepAttachments
          .map(att => (typeof att === 'string' ? att : (att.url || att.publicId || att.name)))
          .filter(Boolean)
      );

      let nextAttachments = reply.attachments || [];
      nextAttachments = nextAttachments.filter(att => {
        const key = typeof att === 'string' ? att : (att.url || att.publicId || att.name);
        return key && keepKeys.has(key);
      });
      reply.attachments = nextAttachments;
    }

    if (req.files && req.files.length > 0) {
      const uploaded = await uploadAttachments(req.files, 'rubbersense/replies');
      reply.attachments = [...(reply.attachments || []), ...uploaded];
    }
    await post.save();
    await post.populate('comments.user', 'name profileImage');
    await post.populate('comments.replies.user', 'name profileImage');
    res.json({ success: true, data: post.comments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/:id/comment/:commentId/reply/:replyId', protect, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }
    const comment = post.comments.id(req.params.commentId);
    if (!comment) {
      return res.status(404).json({ success: false, error: 'Comment not found' });
    }
    const reply = comment.replies.id(req.params.replyId);
    if (!reply) {
      return res.status(404).json({ success: false, error: 'Reply not found' });
    }
    if (reply.user.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    reply.deleteOne();
    await post.save();
    await post.populate('comments.user', 'name profileImage');
    await post.populate('comments.replies.user', 'name profileImage');
    res.json({ success: true, data: post.comments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
