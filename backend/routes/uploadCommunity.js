const express = require('express');
const fs = require('fs');

const router = express.Router();

const upload = require('../middleware/upload');
const { protect } = require('../middleware/auth');
const { uploadToCloudinary } = require('../config/cloudinary');
const CommunityPost = require('../models/CommunityPost');
const parsedMaxUploadSize = Number(process.env.MAX_UPLOAD_SIZE_MB);
const MAX_UPLOAD_SIZE_MB = Number.isFinite(parsedMaxUploadSize) && parsedMaxUploadSize > 0
  ? parsedMaxUploadSize
  : 250;
const ABSOLUTE_URL_PATTERN = /^(?:https?:)?\/\//i;
const SPECIAL_URI_PATTERN = /^(?:file:|content:|blob:|data:)/i;
const LOCAL_HOSTNAME_PATTERN = /^(?:localhost|127\.0\.0\.1|0\.0\.0\.0|::1)$/i;

const cleanLocalFile = (filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (_) {
    // Ignore cleanup errors.
  }
};

const normalizeMediaObject = (item) => {
  if (!item) return null;

  const normalizeIncomingMediaUrl = (value) => {
    if (value === undefined || value === null) return '';
    const input = String(value).trim();
    if (!input || SPECIAL_URI_PATTERN.test(input)) return '';
    if (input.startsWith('//')) return `https:${input}`;
    if (input.startsWith('/')) return input;
    if (/^uploads\//i.test(input)) return `/${input.replace(/^\/+/, '')}`;
    if (ABSOLUTE_URL_PATTERN.test(input)) {
      try {
        const parsed = new URL(input);
        if (LOCAL_HOSTNAME_PATTERN.test(parsed.hostname)) {
          return `${parsed.pathname || ''}${parsed.search || ''}${parsed.hash || ''}` || '';
        }
        return input;
      } catch (_) {
        return '';
      }
    }
    return '';
  };

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
    mimetype: item.mimetype || item.type || 'application/octet-stream',
    filename: item.filename || item.name || `media-${Date.now()}`,
    size: Number(item.size) || 0,
    originalname: item.originalname || item.name || item.filename || `media-${Date.now()}`,
    publicId: item.publicId || item.public_id || null
  };
};

const parseMediaInput = (value) => {
  if (value === undefined || value === null) return [];

  let parsed = value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      parsed = JSON.parse(trimmed);
    } catch (_) {
      parsed = value;
    }
  }

  const list = Array.isArray(parsed) ? parsed : [parsed];
  return list.map(normalizeMediaObject).filter(Boolean);
};

const sanitizeMediaForPersistence = (items = []) => {
  const list = Array.isArray(items) ? items : [items];
  return list.map(normalizeMediaObject).filter(Boolean);
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

const mapClientMedia = (items = []) =>
  (Array.isArray(items) ? items : [])
    .map((item) => {
      const url = item?.url || item?.secure_url;
      if (!url) return null;
      const type = item?.mimetype || item?.mimeType || item?.type || 'application/octet-stream';
      const name = item?.originalname || item?.filename || item?.name || 'file';
      const size = Number(item?.size) || 0;
      const publicId = item?.publicId || item?.public_id || null;
      return {
        url,
        uri: url,
        secure_url: url,
        name,
        filename: name,
        type,
        mimetype: type,
        size,
        publicId
      };
    })
    .filter(Boolean);

router.post('/community/single', protect, (req, res) => {
  upload.single('media')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: `File too large. Maximum allowed size is ${MAX_UPLOAD_SIZE_MB}MB.`
        });
      }
      return res.status(400).json({ success: false, message: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    try {
      const [media] = await uploadFilesToCloudinary([req.file], 'rubbersense/community/uploads');
      return res.json({ success: true, file: media });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  });
});

router.post('/community/multiple', protect, (req, res) => {
  upload.array('media', 10)(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: `File too large. Maximum allowed size is ${MAX_UPLOAD_SIZE_MB}MB.`
        });
      }
      return res.status(400).json({ success: false, message: err.message });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files uploaded' });
    }

    try {
      const files = await uploadFilesToCloudinary(req.files, 'rubbersense/community/uploads');
      return res.json({ success: true, files });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  });
});

router.post('/community/post', protect, (req, res) => {
  upload.array('media', 10)(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: `File too large. Maximum allowed size is ${MAX_UPLOAD_SIZE_MB}MB.`
        });
      }
      return res.status(400).json({ success: false, message: err.message });
    }

    try {
      const uploadedMedia = await uploadFilesToCloudinary(req.files || [], 'rubbersense/community/posts');
      const bodyMedia = parseMediaInput(req.body.media);
      const mergedMedia = [...bodyMedia, ...uploadedMedia];
      const media = sanitizeMediaForPersistence(mergedMedia);

      if (mergedMedia.length > media.length) {
        console.warn(
          `[UploadCommunity] Dropped ${mergedMedia.length - media.length} invalid media item(s) on create`
        );
      }

      const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
      const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';

      if (!title && !content && media.length === 0) {
        return res.status(400).json({ success: false, message: 'Post must include title, content, or media' });
      }

      const post = await CommunityPost.create({
        user: req.user.id,
        title,
        content,
        media
      });

      await post.populate('user', 'name profileImage avatar profilePicture');

      const mappedMedia = mapClientMedia(post.media || []);
      const mappedPost = {
        ...post.toObject(),
        image: mappedMedia[0]?.url || null,
        imageURL: mappedMedia[0]?.url || null,
        imageUrl: mappedMedia[0]?.url || null,
        attachments: mappedMedia,
        media: mappedMedia,
        files: mappedMedia
      };

      return res.status(201).json({
        success: true,
        data: mappedPost,
        message: 'Post created successfully'
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  });
});

module.exports = router;
