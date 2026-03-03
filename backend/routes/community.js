const express = require('express');
const fs = require('fs');

const router = express.Router();

const upload = require('../middleware/upload');
const { protect } = require('../middleware/auth');
const { uploadToCloudinary } = require('../config/cloudinary');
const CommunityPost = require('../models/CommunityPost');
const CommunityComment = require('../models/CommunityComment');
const User = require('../models/User');

const MAX_LIMIT = 50;
const parsedMaxUploadSize = Number(process.env.MAX_UPLOAD_SIZE_MB);
const MAX_UPLOAD_SIZE_MB = Number.isFinite(parsedMaxUploadSize) && parsedMaxUploadSize > 0
  ? parsedMaxUploadSize
  : 250;
const ABSOLUTE_URL_PATTERN = /^(?:https?:)?\/\//i;
const SPECIAL_URI_PATTERN = /^(?:file:|content:|blob:|data:)/i;
const LOCAL_HOSTNAME_PATTERN = /^(?:localhost|127\.0\.0\.1|0\.0\.0\.0|::1|10\.0\.2\.2)$/i;

const isPrivateOrLocalHost = (hostname = '') => {
  const host = String(hostname || '').trim().toLowerCase();
  if (!host) return false;
  if (LOCAL_HOSTNAME_PATTERN.test(host)) return true;
  if (host.startsWith('192.168.')) return true;
  if (host.startsWith('10.')) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  return false;
};

const cleanLocalFile = (filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (_) {
    // Ignore cleanup issues.
  }
};

const parseMaybeJson = (value, fallback = null) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    return fallback;
  }
};

const toArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
};

const getUploadedFiles = (req) => {
  if (!req.files) return [];
  if (Array.isArray(req.files)) return req.files;

  const filesField = Array.isArray(req.files.files) ? req.files.files : [];
  const mediaField = Array.isArray(req.files.media) ? req.files.media : [];
  return [...filesField, ...mediaField];
};

const withUploads = (handler) => (req, res, next) => {
  upload.fields([
    { name: 'files', maxCount: 10 },
    { name: 'media', maxCount: 10 }
  ])(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          error: `File too large. Maximum allowed size is ${MAX_UPLOAD_SIZE_MB}MB.`
        });
      }
      return res.status(400).json({ success: false, error: err.message });
    }

    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  });
};

const normalizeProfileImage = (user = {}) => {
  return user.profileImage || user.avatar?.url || user.profilePicture?.url || null;
};

const getRequestBaseUrl = (req) => {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const protocol = forwardedProto || req.protocol || 'http';
  const host = forwardedHost || req.get('host') || '';
  return host ? `${protocol}://${host}` : '';
};

const normalizeIncomingMediaUrl = (value) => {
  if (value === undefined || value === null) return '';
  const input = String(value).trim();
  if (!input || SPECIAL_URI_PATTERN.test(input)) return '';

  if (input.startsWith('//')) {
    return `https:${input}`;
  }

  if (input.startsWith('/')) return input;

  if (/^uploads\//i.test(input)) {
    return `/${input.replace(/^\/+/, '')}`;
  }

  if (ABSOLUTE_URL_PATTERN.test(input)) {
    try {
      const parsed = new URL(input);
      if (isPrivateOrLocalHost(parsed.hostname)) {
        return `${parsed.pathname || ''}${parsed.search || ''}${parsed.hash || ''}` || '';
      }
      return input;
    } catch (_) {
      return '';
    }
  }

  return '';
};

const normalizeMediaUrlForClient = (value, req) => {
  const raw = normalizeIncomingMediaUrl(value);
  if (!raw) return '';

  const baseUrl = getRequestBaseUrl(req);
  if (raw.startsWith('/')) {
    return baseUrl ? `${baseUrl}${raw}` : raw;
  }

  if (!ABSOLUTE_URL_PATTERN.test(raw)) {
    return baseUrl ? `${baseUrl}/${raw.replace(/^\/+/, '')}` : raw;
  }

  try {
    const parsed = new URL(raw);
    if (!isPrivateOrLocalHost(parsed.hostname) || !baseUrl) {
      return raw;
    }

    const base = new URL(baseUrl);
    parsed.protocol = base.protocol;
    parsed.hostname = base.hostname;
    parsed.port = base.port;
    return parsed.toString();
  } catch (_) {
    return raw;
  }
};

const mapUser = (user = null, req) => {
  if (!user) return null;

  return {
    _id: user._id || user.id,
    name: user.name || 'User',
    profileImage: normalizeMediaUrlForClient(normalizeProfileImage(user), req)
  };
};

const toAttachment = (media = null, req) => {
  if (!media) return null;
  const rawUrl = media.url || media.secure_url || media.path || media.uri;
  const resolvedUrl = normalizeMediaUrlForClient(rawUrl, req);
  if (!resolvedUrl) return null;

  const type = media.mimetype || media.mimeType || media.type || 'application/octet-stream';
  const name = media.originalname || media.filename || media.name || 'file';
  const size = Number(media.size) || 0;
  const publicId = media.publicId || media.public_id || null;

  return {
    url: resolvedUrl,
    uri: resolvedUrl,
    secure_url: resolvedUrl,
    publicId,
    name,
    type,
    mimetype: type,
    size
  };
};

const toCommentMedia = (attachment = null) => {
  if (!attachment || !attachment.url) return null;

  return {
    url: attachment.url,
    mimetype: attachment.mimetype || attachment.type || 'application/octet-stream',
    filename: attachment.filename || attachment.name || `media-${Date.now()}`,
    size: Number(attachment.size) || 0,
    originalname: attachment.originalname || attachment.name || attachment.filename || `media-${Date.now()}`,
    publicId: attachment.publicId || attachment.public_id || null
  };
};

const normalizeIncomingMedia = (input) => {
  const rawList = toArray(input);

  return rawList
    .map((item) => {
      if (!item) return null;
      if (typeof item === 'string') {
        const normalizedUrl = normalizeIncomingMediaUrl(item);
        if (!normalizedUrl) return null;
        return {
          url: normalizedUrl,
          mimetype: 'application/octet-stream',
          filename: `media-${Date.now()}`,
          size: 0,
          originalname: `media-${Date.now()}`
        };
      }

      const url = normalizeIncomingMediaUrl(item.url || item.secure_url || item.path || item.uri);
      if (!url) return null;

      return {
        url,
        mimetype: item.mimetype || item.mimeType || item.type || 'application/octet-stream',
        filename: item.filename || item.name || `media-${Date.now()}`,
        size: Number(item.size) || 0,
        originalname: item.originalname || item.name || item.filename || `media-${Date.now()}`,
        publicId: item.publicId || item.public_id || null
      };
    })
    .filter(Boolean);
};

const sanitizeMediaForPersistence = (items = []) => {
  return toArray(items)
    .map((item) => {
      if (!item) return null;
      const url = normalizeIncomingMediaUrl(item.url || item.secure_url || item.path || item.uri);
      if (!url) return null;

      const originalname = String(
        item.originalname || item.name || item.filename || `media-${Date.now()}`
      );
      const filename = String(item.filename || item.name || originalname || `media-${Date.now()}`);

      return {
        url,
        mimetype: item.mimetype || item.mimeType || item.type || 'application/octet-stream',
        filename,
        size: Number(item.size) || 0,
        originalname,
        publicId: item.publicId || item.public_id || null
      };
    })
    .filter(Boolean);
};

const uploadFilesToCloudinary = async (files, folder) => {
  if (!files || files.length === 0) return [];

  const uploaded = [];

  for (const file of files) {
    try {
      const result = await uploadToCloudinary(file, folder);
      const uploadedUrl = result?.url || result?.secure_url || null;
      if (!uploadedUrl) {
        throw new Error('Cloudinary upload returned no URL');
      }
      uploaded.push({
        url: uploadedUrl,
        mimetype: file.mimetype || 'application/octet-stream',
        filename: result.publicId?.split('/').pop() || file.filename || `media-${Date.now()}`,
        size: Number(file.size) || 0,
        originalname: file.originalname || file.filename || `media-${Date.now()}`,
        publicId: result.publicId || null
      });
    } finally {
      cleanLocalFile(file.path);
    }
  }

  return uploaded;
};

const likeUsersFromPost = (likes = [], req) => {
  return likes
    .map((like) => mapUser(like?.user || like, req))
    .filter(Boolean);
};

const mapComment = (comment = null, req) => {
  if (!comment) return null;

  const mainAttachment = toAttachment(comment.media, req);
  const attachments = mainAttachment ? [mainAttachment] : [];

  const replies = Array.isArray(comment.replies)
    ? comment.replies
        .map((reply) => {
          const replyAttachment = toAttachment(reply?.media, req);
          const replyAttachments = replyAttachment ? [replyAttachment] : [];

          return {
            _id: reply._id,
            user: mapUser(reply.user, req),
            text: reply.content || '',
            content: reply.content || '',
            attachments: replyAttachments,
            media: replyAttachment ? { ...replyAttachment } : null,
            files: replyAttachments,
            createdAt: reply.createdAt,
            updatedAt: reply.updatedAt
          };
        })
        .filter(Boolean)
    : [];

  return {
    _id: comment._id,
    user: mapUser(comment.user, req),
    text: comment.content || '',
    content: comment.content || '',
    attachments,
    media: mainAttachment ? { ...mainAttachment } : null,
    files: attachments,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    replies
  };
};

const mapPost = (post = null, currentUserId = null, req) => {
  if (!post) return null;

  const attachments = Array.isArray(post.media)
    ? post.media.map((entry) => toAttachment(entry, req)).filter(Boolean)
    : [];

  const comments = Array.isArray(post.comments)
    ? post.comments.map((entry) => mapComment(entry, req)).filter(Boolean)
    : [];

  const likes = likeUsersFromPost(post.likes || [], req);
  const userLiked = currentUserId
    ? likes.some((u) => String(u?._id) === String(currentUserId))
    : false;

  return {
    _id: post._id,
    user: mapUser(post.user, req),
    title: post.title || '',
    content: post.content || '',
    image: attachments[0]?.url || null,
    imageURL: attachments[0]?.url || null,
    imageUrl: attachments[0]?.url || null,
    attachments,
    media: attachments.map((item) => ({
      url: item.url,
      mimetype: item.mimetype || item.type,
      filename: item.name,
      size: item.size,
      publicId: item.publicId || null
    })),
    files: attachments,
    tags: post.tags || [],
    likes,
    likesCount: likes.length,
    comments,
    commentsCount: comments.length,
    views: Number(post.views) || 0,
    isPinned: !!post.isPinned,
    isEdited: !!post.isEdited,
    isDeleted: !!post.isDeleted,
    isHidden: !!post.isHidden,
    userLiked,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt
  };
};

const basePopulate = [
  { path: 'user', select: 'name profileImage avatar profilePicture' },
  { path: 'likes.user', select: 'name profileImage avatar profilePicture' },
  {
    path: 'comments',
    match: { parentComment: null, isDeleted: false, isHidden: { $ne: true } },
    options: { sort: { createdAt: -1 } },
    populate: [
      { path: 'user', select: 'name profileImage avatar profilePicture' },
      {
        path: 'replies',
        match: { isDeleted: false, isHidden: { $ne: true } },
        options: { sort: { createdAt: 1 } },
        populate: { path: 'user', select: 'name profileImage avatar profilePicture' }
      }
    ]
  }
];

const applyPopulate = (query) => {
  let next = query;
  for (const item of basePopulate) {
    next = next.populate(item);
  }
  return next;
};

const parseSort = (sortInput) => {
  const sort = String(sortInput || '-createdAt').trim();
  if (!sort) return { createdAt: -1 };

  if (sort.startsWith('-')) {
    return { [sort.slice(1)]: -1 };
  }

  return { [sort]: 1 };
};

const fetchPostWithGraph = async (postId) => {
  const query = CommunityPost.findOne({ _id: postId, isDeleted: false, isHidden: { $ne: true } });
  return applyPopulate(query);
};

const fetchMappedComments = async (postId, req) => {
  const post = await fetchPostWithGraph(postId);
  if (!post) return [];
  return (post.comments || []).map((entry) => mapComment(entry, req)).filter(Boolean);
};

const parseKeepKeys = (keepInput) => {
  const parsed = parseMaybeJson(keepInput, keepInput);

  return new Set(
    toArray(parsed)
      .map((item) => {
        if (!item) return null;
        if (typeof item === 'string') return item;
        return item.url || item.publicId || item.public_id || item.filename || item.originalname || item.name || null;
      })
      .filter(Boolean)
  );
};

const parseMediaFromBody = (mediaInput) => {
  const parsed = parseMaybeJson(mediaInput, mediaInput);
  return normalizeIncomingMedia(parsed);
};

const ensureOwner = (ownerId, currentUserId) => {
  return String(ownerId) === String(currentUserId);
};

const listPosts = async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const query = { isDeleted: false, isHidden: { $ne: true } };
  const search = String(req.query.search || '').trim();
  const tag = String(req.query.tag || '').trim();

  if (search) {
    query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { content: { $regex: search, $options: 'i' } }
    ];
  }

  if (tag) {
    query.tags = { $in: [new RegExp(tag, 'i')] };
  }

  const [total, posts] = await Promise.all([
    CommunityPost.countDocuments(query),
    applyPopulate(
      CommunityPost.find(query)
        .sort(parseSort(req.query.sort))
        .skip(skip)
        .limit(limit)
    )
  ]);

  const mapped = posts.map((post) => mapPost(post, req.user?.id, req));

  res.json({
    success: true,
    count: mapped.length,
    total,
    totalPages: Math.ceil(total / limit),
    currentPage: page,
    data: mapped
  });
};

const getSinglePost = async (req, res) => {
  const post = await fetchPostWithGraph(req.params.id);
  if (!post) {
    return res.status(404).json({ success: false, error: 'Post not found' });
  }

  post.views = (post.views || 0) + 1;
  await post.save();

  res.json({ success: true, data: mapPost(post, req.user?.id, req) });
};

const createPost = async (req, res) => {
  const uploadedFiles = getUploadedFiles(req);

  try {
    const uploadedMedia = await uploadFilesToCloudinary(uploadedFiles, 'rubbersense/community/posts');
    const bodyMedia = parseMediaFromBody(req.body.media);
    const mergedMedia = [...bodyMedia, ...uploadedMedia];
    const media = sanitizeMediaForPersistence(mergedMedia);

    if (mergedMedia.length > media.length) {
      console.warn(
        `[Community] Dropped ${mergedMedia.length - media.length} invalid media item(s) on createPost`
      );
    }

    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';

    if (!title && !content && media.length === 0) {
      return res.status(400).json({ success: false, error: 'Post must include title, content, or media' });
    }

    const post = await CommunityPost.create({
      user: req.user.id,
      title,
      content,
      media
    });

    const fresh = await fetchPostWithGraph(post._id);
    return res.status(201).json({ success: true, data: mapPost(fresh, req.user.id, req) });
  } finally {
    // Cleanup local temp files if upload failed before cloudinary stage.
    for (const file of uploadedFiles) {
      cleanLocalFile(file.path);
    }
  }
};

const updatePost = async (req, res) => {
  const uploadedFiles = getUploadedFiles(req);

  try {
    const post = await CommunityPost.findOne({ _id: req.params.id, isDeleted: false });
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    if (!ensureOwner(post.user, req.user.id)) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    if (typeof req.body.title === 'string') post.title = req.body.title.trim();
    if (typeof req.body.content === 'string') post.content = req.body.content.trim();

    if (req.body.keepAttachments !== undefined) {
      const keepKeys = parseKeepKeys(req.body.keepAttachments);
      post.media = (post.media || []).filter((item) => {
        const key = item.url || item.publicId || item.public_id || item.filename || item.originalname;
        return key && keepKeys.has(key);
      });
    }

    const uploadedMedia = await uploadFilesToCloudinary(uploadedFiles, 'rubbersense/community/posts');
    const bodyMedia = parseMediaFromBody(req.body.media);

    if (bodyMedia.length > 0 || uploadedMedia.length > 0) {
      const mergedMedia = [...(post.media || []), ...bodyMedia, ...uploadedMedia];
      post.media = sanitizeMediaForPersistence(mergedMedia);
    }

    post.isEdited = true;
    post.lastEdited = new Date();

    await post.save();

    const fresh = await fetchPostWithGraph(post._id);
    return res.json({ success: true, data: mapPost(fresh, req.user.id, req) });
  } finally {
    for (const file of uploadedFiles) {
      cleanLocalFile(file.path);
    }
  }
};

const deletePost = async (req, res) => {
  const post = await CommunityPost.findOne({ _id: req.params.id, isDeleted: false });
  if (!post) {
    return res.status(404).json({ success: false, error: 'Post not found' });
  }

  if (!ensureOwner(post.user, req.user.id)) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }

  post.isDeleted = true;
  await post.save();

  res.json({ success: true, data: req.params.id });
};

const togglePostLike = async (req, res) => {
  const post = await CommunityPost.findOne({ _id: req.params.id, isDeleted: false, isHidden: { $ne: true } });
  if (!post) {
    return res.status(404).json({ success: false, error: 'Post not found' });
  }

  const index = (post.likes || []).findIndex((like) => String(like.user) === String(req.user.id));

  if (index === -1) {
    post.likes.unshift({ user: req.user.id, createdAt: new Date() });
  } else {
    post.likes.splice(index, 1);
  }

  await post.save();
  await post.populate('likes.user', 'name profileImage avatar profilePicture');

  res.json({ success: true, data: likeUsersFromPost(post.likes) });
};

const createComment = async (req, res, forcedParentId = null) => {
  const uploadedFiles = getUploadedFiles(req);

  try {
    const post = await CommunityPost.findOne({ _id: req.params.id, isDeleted: false, isHidden: { $ne: true } });
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    const text = typeof req.body.text === 'string'
      ? req.body.text.trim()
      : (typeof req.body.content === 'string' ? req.body.content.trim() : '');

    const parentCommentId = forcedParentId || req.body.parentComment || null;

    const uploadedMedia = await uploadFilesToCloudinary(uploadedFiles, 'rubbersense/community/comments');
    const bodyMedia = parseMediaFromBody(req.body.media);
    const mediaItems = [...bodyMedia, ...uploadedMedia];
    const media = toCommentMedia(mediaItems[0] || null);

    if (!text && !media) {
      return res.status(400).json({ success: false, error: 'Comment must include content or media' });
    }

    const comment = await CommunityComment.create({
      post: post._id,
      user: req.user.id,
      content: text,
      media,
      parentComment: parentCommentId || null
    });

    if (parentCommentId) {
      const parent = await CommunityComment.findOne({ _id: parentCommentId, post: post._id, isDeleted: false });
      if (!parent) {
        await CommunityComment.findByIdAndDelete(comment._id);
        return res.status(404).json({ success: false, error: 'Parent comment not found' });
      }
      parent.replies.push(comment._id);
      await parent.save();
    } else {
      post.comments.push(comment._id);
      await post.save();
    }

    const comments = await fetchMappedComments(post._id, req);
    return res.json({ success: true, data: comments });
  } finally {
    for (const file of uploadedFiles) {
      cleanLocalFile(file.path);
    }
  }
};

const updateCommentById = async (commentId, req, res) => {
  const uploadedFiles = getUploadedFiles(req);

  try {
    const comment = await CommunityComment.findOne({ _id: commentId, isDeleted: false, isHidden: { $ne: true } });
    if (!comment) {
      return res.status(404).json({ success: false, error: 'Comment not found' });
    }

    if (!ensureOwner(comment.user, req.user.id)) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const text = typeof req.body.text === 'string'
      ? req.body.text.trim()
      : (typeof req.body.content === 'string' ? req.body.content.trim() : null);

    if (text !== null) {
      comment.content = text;
    }

    if (req.body.keepAttachments !== undefined) {
      const keepKeys = parseKeepKeys(req.body.keepAttachments);
      const current = toAttachment(comment.media, req);
      if (current) {
        const currentKey = current.url || current.publicId || current.name;
        if (!keepKeys.has(currentKey)) {
          comment.media = null;
        }
      } else {
        comment.media = null;
      }
    }

    const uploadedMedia = await uploadFilesToCloudinary(uploadedFiles, 'rubbersense/community/comments');
    const bodyMedia = parseMediaFromBody(req.body.media);
    const mediaItems = [...bodyMedia, ...uploadedMedia];

    if (mediaItems.length > 0) {
      comment.media = toCommentMedia(mediaItems[0]);
    }

    comment.isEdited = true;
    comment.lastEdited = new Date();

    await comment.save();

    const comments = await fetchMappedComments(comment.post, req);
    return res.json({ success: true, data: comments });
  } finally {
    for (const file of uploadedFiles) {
      cleanLocalFile(file.path);
    }
  }
};

const deleteCommentById = async (commentId, req, res) => {
  const comment = await CommunityComment.findOne({ _id: commentId, isDeleted: false });
  if (!comment) {
    return res.status(404).json({ success: false, error: 'Comment not found' });
  }

  if (!ensureOwner(comment.user, req.user.id)) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }

  comment.isDeleted = true;
  await comment.save();

  if (comment.parentComment) {
    await CommunityComment.updateOne(
      { _id: comment.parentComment },
      { $pull: { replies: comment._id } }
    );
  } else {
    await CommunityPost.updateOne(
      { _id: comment.post },
      { $pull: { comments: comment._id } }
    );
  }

  const comments = await fetchMappedComments(comment.post, req);
  return res.json({ success: true, data: comments });
};

const toggleCommentLike = async (req, res) => {
  const comment = await CommunityComment.findOne({ _id: req.params.id, isDeleted: false, isHidden: { $ne: true } });
  if (!comment) {
    return res.status(404).json({ success: false, error: 'Comment not found' });
  }

  const index = (comment.likes || []).findIndex((like) => String(like.user) === String(req.user.id));

  if (index === -1) {
    comment.likes.unshift({ user: req.user.id, createdAt: new Date() });
  } else {
    comment.likes.splice(index, 1);
  }

  await comment.save();

  res.json({
    success: true,
    data: {
      likes: comment.likes,
      likesCount: comment.likes.length
    }
  });
};

const listUserPosts = async (req, res) => {
  const posts = await applyPopulate(
    CommunityPost.find({ user: req.user.id, isDeleted: false })
      .sort({ createdAt: -1 })
  );

  const mapped = posts.map((post) => mapPost(post, req.user.id, req));

  res.json({ success: true, count: mapped.length, data: mapped });
};

const listTags = async (req, res) => {
  const tags = await CommunityPost.aggregate([
    { $match: { isDeleted: false, isHidden: { $ne: true } } },
    { $unwind: '$tags' },
    { $group: { _id: '$tags', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 20 }
  ]);

  res.json({ success: true, data: tags });
};

const listTrending = async (req, res) => {
  const posts = await applyPopulate(
    CommunityPost.find({ isDeleted: false, isHidden: { $ne: true } })
      .sort({ views: -1, createdAt: -1 })
      .limit(10)
  );

  const mapped = posts.map((post) => mapPost(post, req.user?.id, req));
  res.json({ success: true, count: mapped.length, data: mapped });
};

const runSearch = async (req, res) => {
  const query = String(req.query.q || '').trim();
  if (!query) {
    return res.json({ success: true, data: { posts: [], comments: [], users: [] } });
  }

  const [posts, comments, users] = await Promise.all([
    applyPopulate(
      CommunityPost.find({
        isDeleted: false,
        isHidden: { $ne: true },
        $or: [
          { title: { $regex: query, $options: 'i' } },
          { content: { $regex: query, $options: 'i' } },
          { tags: { $regex: query, $options: 'i' } }
        ]
      }).limit(20)
    ),
    CommunityComment.find({
      isDeleted: false,
      isHidden: { $ne: true },
      content: { $regex: query, $options: 'i' }
    })
      .populate('user', 'name profileImage avatar profilePicture')
      .populate('post', 'title')
      .limit(20),
    User.find({ name: { $regex: query, $options: 'i' } })
      .select('name profileImage avatar profilePicture')
      .limit(20)
  ]);

  res.json({
    success: true,
    data: {
      posts: posts.map((post) => mapPost(post, req.user?.id, req)),
      comments: comments.map((comment) => mapComment(comment, req)),
      users: users.map((user) => mapUser(user, req))
    }
  });
};

router.get('/', protect, listPosts);
router.get('/posts', protect, listPosts);
router.get('/my-posts', protect, listUserPosts);
router.get('/user/posts', protect, listUserPosts);
router.get('/tags', protect, listTags);
router.get('/trending', protect, listTrending);
router.get('/search', protect, runSearch);

router.get('/posts/:id/comments', protect, async (req, res) => {
  const post = await CommunityPost.findOne({ _id: req.params.id, isDeleted: false, isHidden: { $ne: true } });
  if (!post) {
    return res.status(404).json({ success: false, error: 'Post not found' });
  }

  const comments = await fetchMappedComments(post._id, req);
  res.json({ success: true, count: comments.length, data: comments });
});

router.get('/posts/:id', protect, getSinglePost);
router.get('/:id', protect, getSinglePost);

router.post('/', protect, withUploads(createPost));
router.post('/posts', protect, withUploads(createPost));

router.put('/:id', protect, withUploads(updatePost));
router.put('/posts/:id', protect, withUploads(updatePost));

router.delete('/:id', protect, deletePost);
router.delete('/posts/:id', protect, deletePost);

router.put('/:id/like', protect, togglePostLike);
router.put('/posts/:id/like', protect, togglePostLike);

router.post('/:id/comment', protect, withUploads(async (req, res) => {
  await createComment(req, res, null);
}));

router.post('/:id/comment/:commentId/reply', protect, withUploads(async (req, res) => {
  await createComment(req, res, req.params.commentId);
}));

router.put('/:id/comment/:commentId', protect, withUploads(async (req, res) => {
  await updateCommentById(req.params.commentId, req, res);
}));

router.delete('/:id/comment/:commentId', protect, async (req, res) => {
  await deleteCommentById(req.params.commentId, req, res);
});

router.put('/:id/comment/:commentId/reply/:replyId', protect, withUploads(async (req, res) => {
  await updateCommentById(req.params.replyId, req, res);
}));

router.delete('/:id/comment/:commentId/reply/:replyId', protect, async (req, res) => {
  await deleteCommentById(req.params.replyId, req, res);
});

router.post('/posts/:id/comments', protect, withUploads(async (req, res) => {
  await createComment(req, res, req.body.parentComment || null);
}));

router.put('/comments/:id', protect, withUploads(async (req, res) => {
  await updateCommentById(req.params.id, req, res);
}));

router.delete('/comments/:id', protect, async (req, res) => {
  await deleteCommentById(req.params.id, req, res);
});

router.put('/comments/:id/like', protect, toggleCommentLike);

module.exports = router;
