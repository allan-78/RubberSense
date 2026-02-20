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
      const message = userExists.isActive === false
        ? 'This account is deactivated. Please contact support.'
        : 'Email is already registered';
      console.log('⚠️ [REGISTER] User already exists:', email);
      return res.status(400).json({
        success: false,
        error: message
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
          followers: user.followers,
          following: user.following,
          blockedUsers: user.blockedUsers,
          isActive: user.isActive,
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

    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        error: 'This account is deactivated'
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
          followers: user.followers,
          following: user.following,
          blockedUsers: user.blockedUsers,
          isActive: user.isActive,
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
    const user = await User.findById(req.user.id)
      .populate('followers', 'name profileImage')
      .populate('following', 'name profileImage');

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
          followers: user.followers,
          following: user.following,
          blockedUsers: user.blockedUsers,
          isActive: user.isActive,
          followersCount: Array.isArray(user.followers) ? user.followers.length : 0,
          followingCount: Array.isArray(user.following) ? user.following.length : 0,
          followersIds: Array.isArray(user.followers) ? user.followers.map(u => u._id || u) : [],
          followingIds: Array.isArray(user.following) ? user.following.map(u => u._id || u) : [],
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

// ============================================
// @route   POST /api/auth/refresh
// @desc    Refresh JWT token
// @access  Private
// ============================================
router.post('/refresh', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('followers', 'name profileImage')
      .populate('following', 'name profileImage');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    
    res.status(200).json({
      success: true,
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
          followers: user.followers,
          following: user.following,
          blockedUsers: user.blockedUsers,
          isActive: user.isActive,
          followersCount: Array.isArray(user.followers) ? user.followers.length : 0,
          followingCount: Array.isArray(user.following) ? user.following.length : 0,
          followersIds: Array.isArray(user.followers) ? user.followers.map(u => u._id || u) : [],
          followingIds: Array.isArray(user.following) ? user.following.map(u => u._id || u) : [],
          createdAt: user.createdAt
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error refreshing token'
    });
  }
});

// ============================================
// @route   PUT /api/auth/change-password
// @desc    Change password for authenticated user
// @access  Private
// ============================================
router.put('/change-password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body || {};

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password, new password, and confirmation are required'
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        error: 'New password and confirmation do not match'
      });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({
        success: false,
        error: 'New password must be at least 6 characters'
      });
    }

    const user = await User.findById(req.user.id).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        error: 'This account is deactivated'
      });
    }

    const isCurrentMatch = await user.comparePassword(currentPassword);
    if (!isCurrentMatch) {
      return res.status(400).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }

    const isSameAsOld = await user.comparePassword(newPassword);
    if (isSameAsOld) {
      return res.status(400).json({
        success: false,
        error: 'New password must be different from current password'
      });
    }

    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update password'
    });
  }
});

// ============================================
// @route   PUT /api/auth/deactivate-account
// @desc    Deactivate account for authenticated user
// @access  Private
// ============================================
router.put('/deactivate-account', protect, async (req, res) => {
  try {
    const { password } = req.body || {};

    if (!password) {
      return res.status(400).json({
        success: false,
        error: 'Password is required to deactivate account'
      });
    }

    const user = await User.findById(req.user.id).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (user.isActive === false) {
      return res.status(400).json({
        success: false,
        error: 'Account is already deactivated'
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Password is incorrect'
      });
    }

    user.isActive = false;
    user.deactivatedAt = new Date();
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    user.verificationToken = undefined;
    await user.save();

    res.json({
      success: true,
      message: 'Account deactivated successfully'
    });
  } catch (error) {
    console.error('Deactivate account error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to deactivate account'
    });
  }
});
// ============================================
// @route   POST /api/auth/forgot-password
// @desc    Forgot password
// @access  Public
// ============================================
router.post('/forgot-password', async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'There is no user with that email'
      });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        error: 'This account is deactivated'
      });
    }

    // Get reset token
    const resetToken = user.getResetPasswordToken();

    await user.save({ validateBeforeSave: false });

    // Create reset url
    const host = process.env.SERVER_URL 
      ? process.env.SERVER_URL.replace('http://', '').replace('https://', '') 
      : req.get('host');
    
    const resetUrl = `${req.protocol}://${host}/api/auth/reset-password-page/${resetToken}`;

    const message = `
      <h1>Password Reset Request</h1>
      <p>You are receiving this email because you (or someone else) has requested the reset of a password.</p>
      <p>Please click the link below to reset your password:</p>
      <a href="${resetUrl}" clicktracking=off>${resetUrl}</a>
      <p>If you didn't request this, please ignore this email.</p>
    `;

    try {
      await sendEmail({
        email: user.email,
        subject: 'RubberSense - Password Reset Token',
        message
      });

      res.status(200).json({
        success: true,
        data: 'Email sent'
      });
    } catch (err) {
      console.log(err);
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;

      await user.save({ validateBeforeSave: false });

      return res.status(500).json({
        success: false,
        error: 'Email could not be sent'
      });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
});

// ============================================
// @route   PUT /api/auth/reset-password/:resettoken
// @desc    Reset password
// @access  Public
// ============================================
router.put('/reset-password/:resettoken', async (req, res) => {
  try {
    // Get hashed token
    const resetPasswordToken = crypto
      .createHash('sha256')
      .update(req.params.resettoken)
      .digest('hex');

    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'Invalid token or token expired'
      });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        error: 'This account is deactivated'
      });
    }

    // Set new password
    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save();

    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      data: {
        token,
        user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role
        }
      }
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
});

// ============================================
// @route   GET /api/auth/reset-password-page/:resettoken
// @desc    Serve HTML page for password reset
// @access  Public
// ============================================
router.get('/reset-password-page/:resettoken', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Reset Password</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f0f2f5; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
          .card { background: white; padding: 2rem; border-radius: 1rem; box-shadow: 0 4px 6px rgba(0,0,0,0.1); width: 100%; max-width: 400px; }
          h2 { text-align: center; color: #333; margin-bottom: 1.5rem; }
          input { width: 100%; padding: 0.75rem; margin-bottom: 1rem; border: 1px solid #ccc; border-radius: 0.5rem; box-sizing: border-box; font-size: 1rem; }
          button { width: 100%; padding: 0.75rem; background-color: #10B981; color: white; border: none; border-radius: 0.5rem; font-size: 1rem; cursor: pointer; transition: background 0.3s; }
          button:hover { background-color: #059669; }
          .message { text-align: center; margin-top: 1rem; font-size: 0.9rem; }
          .success { color: #10B981; }
          .error { color: #EF4444; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>Reset Password</h2>
          <form id="resetForm">
            <input type="password" id="password" placeholder="New Password" required minlength="6">
            <input type="password" id="confirmPassword" placeholder="Confirm Password" required minlength="6">
            <button type="submit">Reset Password</button>
            <div id="message" class="message"></div>
          </form>
        </div>
        <script>
          const form = document.getElementById('resetForm');
          const messageDiv = document.getElementById('message');
          const token = '${req.params.resettoken}';

          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirmPassword').value;

            if (password !== confirmPassword) {
              messageDiv.textContent = 'Passwords do not match';
              messageDiv.className = 'message error';
              return;
            }

            try {
              const res = await fetch('/api/auth/reset-password/' + token, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
              });
              const data = await res.json();

              if (data.success) {
                messageDiv.textContent = 'Email password reset successfully';
                messageDiv.className = 'message success';
                form.style.display = 'none';
              } else {
                messageDiv.textContent = data.error || 'Something went wrong';
                messageDiv.className = 'message error';
              }
            } catch (err) {
              messageDiv.textContent = 'Network error';
              messageDiv.className = 'message error';
            }
          });
        </script>
      </body>
      </html>
    `);
});

module.exports = router;
