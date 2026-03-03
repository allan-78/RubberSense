// ============================================
// 📤 File Upload Middleware (Multer)
// ============================================

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const parsedMaxUploadSize = Number(process.env.MAX_UPLOAD_SIZE_MB);
const MAX_UPLOAD_SIZE_MB = Number.isFinite(parsedMaxUploadSize) && parsedMaxUploadSize > 0
  ? parsedMaxUploadSize
  : 250;

// Ensure uploads directory exists
const uploadDir = 'uploads/';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir); // Temporary storage
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'rubbersense-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp|mp4|mov|avi|webm|pdf|doc|docx|ppt|pptx|xls|xlsx|txt|csv|zip/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype.toLowerCase());

  if (mimetype || extname) {
    return cb(null, true);
  } else {
    cb(new Error('Unsupported file type'));
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: Math.max(1, MAX_UPLOAD_SIZE_MB) * 1024 * 1024
  },
  fileFilter: fileFilter
});

module.exports = upload;
