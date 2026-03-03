// ============================================
// ☁️ Cloudinary Configuration
// ============================================

const cloudinary = require('cloudinary').v2;
const path = require('path');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const VIDEO_EXT_PATTERN = /\.(mp4|mov|avi|webm|m4v|mkv)$/i;
const IMAGE_EXT_PATTERN = /\.(jpg|jpeg|png|gif|webp|bmp|heic|heif)$/i;

// Upload file to Cloudinary
const uploadToCloudinary = async (file, folder = 'rubbersense') => {
  try {
    if (!file?.path) {
      throw new Error('Invalid file path for upload');
    }

    const mimeType = String(file.mimetype || file.mimeType || file.type || '').toLowerCase();
    const originalName = String(file.originalname || file.filename || file.path || '');
    const extension = path.extname(originalName).toLowerCase();
    const isVideo = mimeType.startsWith('video/') || VIDEO_EXT_PATTERN.test(extension);
    const isImage = mimeType.startsWith('image/') || IMAGE_EXT_PATTERN.test(extension);

    const options = {
      folder: folder,
      resource_type: isVideo ? 'video' : 'auto'
    };

    if (isImage) {
      options.transformation = [
        { width: 1920, height: 1920, crop: 'limit' },
        { quality: 'auto' }
      ];
    }

    const result = isVideo
      ? await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_large(
            file.path,
            { ...options, chunk_size: 6_000_000 },
            (error, response) => {
              if (error) return reject(error);
              return resolve(response);
            }
          );
        })
      : await cloudinary.uploader.upload(file.path, options);

    const resolvedUrl = result?.secure_url || result?.url || null;
    if (!resolvedUrl) {
      throw new Error('Cloudinary did not return a media URL');
    }

    return {
      url: resolvedUrl,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw new Error(error?.message || 'Failed to upload file to Cloudinary');
  }
};

// Delete image from Cloudinary
const deleteFromCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    throw new Error('Failed to delete image from Cloudinary');
  }
};

module.exports = {
  cloudinary,
  uploadToCloudinary,
  deleteFromCloudinary
};
