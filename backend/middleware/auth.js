// ============================================
// 🔐 JWT Authentication Middleware
// ============================================

const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  try {
    let token;

    // Check if token exists in Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // Check if token exists
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Not authorized to access this route - No token provided'
      });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from database
      req.user = await User.findById(decoded.id).select('-password').lean();

      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'User not found'
        });
      }

      if (req.user.isActive === false) {
        return res.status(403).json({
          success: false,
          error: 'This account is deactivated'
        });
      }

      // Add id property because lean() returns plain object with _id
      req.user.id = req.user._id.toString();

      next();
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: 'Not authorized - Invalid token'
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Server error in authentication'
    });
  }
};

// Middleware to check if user is admin
const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    return res.status(403).json({
      success: false,
      error: 'Access denied - Admin only'
    });
  }
};

module.exports = { protect, adminOnly };
