// ============================================
// 🔑 Authentication Routes
// ============================================

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const sendEmail = require('../utils/sendEmail');

// ============================================
// HELPER: Generate JWT Token
// ============================================
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
};

// @route   POST /api/auth/register
// @desc    Register user
// @access  Public
router.post('/register', async (req, res) => {
  const start = Date.now();
  console.log('📝 [REGISTER] Request received:', req.body.email);
  try {
    const { name, email, password, phoneNumber, location } = req.body;

    // Check if user exists
    const userExists = await User.findOne({ email });
    console.log(`⏱️ [PERF] User check took: ${Date.now() - start}ms`);

    if (userExists) {
      console.log('⚠️ [REGISTER] User already exists:', email);
      return res.status(400).json({
        success: false,
        error: 'Email is already registered'
      });
    }

    console.log('✨ [REGISTER] Creating new user...');
    // Generate verification token
    const verificationToken = crypto.randomBytes(20).toString('hex');

    const createStart = Date.now();
    // Create user
    const user = await User.create({
      name,
      email,
      password,
      phoneNumber,
      location,
      verificationToken,
      isVerified: false // Explicitly set to false
    });
    console.log(`⏱️ [PERF] User creation (hashing+save) took: ${Date.now() - createStart}ms`);
    console.log('✅ [REGISTER] User created:', user._id);

    // Create verification url
    // Use configured SERVER_URL or fallback to request host
    const host = process.env.SERVER_URL 
      ? process.env.SERVER_URL.replace('http://', '').replace('https://', '') 
      : req.get('host');
    
    // If running on local network IP, ensure we use that
    const verifyUrl = `${req.protocol}://${host}/api/auth/verify-email/${verificationToken}`;

    const message = `
      <h1>You are almost there! 🌳</h1>
      <p>Please click the link below to verify your email address and activate your account:</p>
      <a href="${verifyUrl}" clicktracking=off>${verifyUrl}</a>
      <p>If you didn't request this, please ignore this email.</p>
    `;

    // Generate token for auto-login
    const token = generateToken(user._id);

    // Send response IMMEDIATELY
    res.status(201).json({
      success: true,
      message: 'User registered. Please check your email to verify your account.',
      data: {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          phoneNumber: user.phoneNumber,
          location: user.location,
          isVerified: user.isVerified,
          profileImage: user.profileImage,
          createdAt: user.createdAt
        }
      }
    });

    // Send email in background (Fire and Forget)
    // We don't await this, so it doesn't block the response
    console.log('📧 [REGISTER] Sending verification email in background to:', user.email);
    sendEmail({
      email: user.email,
      subject: 'RubberSense - Email Verification',
      message
    }).then(() => {
      console.log('📨 [REGISTER] Email sent successfully (Background)');
    }).catch(emailError => {
      console.error('❌ [REGISTER] Email send error (Background):', emailError);
      // Since response is already sent, we can't notify user here, 
      // but they will notice they didn't get email and can request resend.
    });

  } catch (error) {
    console.error('❌ [REGISTER] Server Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Server Error'
    });
  }
});

// ============================================
// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
// ============================================
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Please provide email and password'
      });
    }

    // Find user and include password and verificationToken
    const user = await User.findOne({ email }).select('+password +verificationToken');

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Check password
    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Check verification - removed blocking check
    // if (!user.isVerified) {
    //   return res.status(401).json({
    //     success: false,
    //     error: 'Please verify your email address first',
    //     isVerified: false
    //   });
    // }

    // Generate token
    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          phoneNumber: user.phoneNumber,
          location: user.location,
          isVerified: user.isVerified,
          profileImage: user.profileImage,
          createdAt: user.createdAt
        }
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during login'
    });
  }
});

// ============================================
// @route   GET /api/auth/verify-email/:token
// @desc    Verify email
// @access  Public
// ============================================
router.get('/verify-email/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const user = await User.findOne({ verificationToken: token });

    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired verification token'
      });
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    await user.save();

    // Return HTML success page
    res.status(200).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Email Verified</title>
        <style>
          body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #f0f2f5; }
          .container { text-align: center; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          h1 { color: #2ecc71; margin-bottom: 20px; }
          p { color: #555; font-size: 18px; margin-bottom: 30px; }
          .icon { font-size: 64px; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">✅</div>
          <h1>Email Verified Successfully!</h1>
          <p>Your account has been activated.</p>
          <p>You can now return to the RubberSense app and login.</p>
        </div>
      </body>
      </html>
    `);

  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during verification'
    });
  }
});

// ============================================
// @route   POST /api/auth/resend-verification
// @desc    Resend verification email
// @access  Public
// ============================================
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        error: 'User already verified'
      });
    }

    // Generate new token
    const verificationToken = crypto.randomBytes(20).toString('hex');
    user.verificationToken = verificationToken;
    await user.save();

    const verifyUrl = `${req.protocol}://${req.get('host')}/api/auth/verify-email/${verificationToken}`;

    const message = `
      <h1>Email Verification</h1>
      <p>Please verify your email address to activate your account.</p>
      <p>Click the link below or copy it to your browser:</p>
      <a href="${verifyUrl}" clicktracking=off>${verifyUrl}</a>
      <p>If you did not request this, please ignore this email.</p>
    `;

    await sendEmail({
      email: user.email,
      subject: 'RubberSense - Email Verification (Resend)',
      message
    });

    res.status(200).json({
      success: true,
      message: 'Verification email resent'
    });

  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during resend'
    });
  }
});

// ============================================
// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
// ============================================
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          phoneNumber: user.phoneNumber,
          location: user.location,
          isVerified: user.isVerified,
          profileImage: user.profileImage,
          createdAt: user.createdAt
        }
      }
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error fetching user data'
    });
  }
});

module.exports = router;
