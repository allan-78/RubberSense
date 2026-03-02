// ============================================
// 🌳 RUBBERSENSE - Main Server File
// ============================================

const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const connectDB = require('./config/database');
const { initializeSocket } = require('./socket');
// Import routes (we'll create these next)
const authRoutes = require('./routes/auth');
const treeRoutes = require('./routes/trees');
const scanRoutes = require('./routes/scans');
const latexRoutes = require('./routes/latex');
const chatRoutes = require('./routes/chat');
const communityRoutes = require('./routes/community');
const userRoutes = require('./routes/users');
const v1UsersCompatRoutes = require('./routes/v1UsersCompat');
const v1AnalysisCompatRoutes = require('./routes/v1AnalysisCompat');
const messageRoutes = require('./routes/messages');
const marketRoutes = require('./routes/market');
const syncRoutes = require('./routes/sync');
const notificationRoutes = require('./routes/notifications');
const uploadCommunityRoutes = require('./routes/uploadCommunity');
const mailRoutes = require('./routes/mail');
const contactRoutes = require('./routes/contact');

// Initialize Express app
const app = express();

// ============================================
// MIDDLEWARE SETUP
// ============================================

// Request Logging Middleware
app.use((req, res, next) => {
  console.log(`📨 [${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve uploaded files for legacy/community records that store /uploads paths.
const uploadDirs = [
  path.resolve(__dirname, 'uploads'),
  path.resolve(__dirname, '../uploads')
];
for (const dir of uploadDirs) {
  if (fs.existsSync(dir)) {
    app.use('/uploads', express.static(dir));
  }
}

// CORS - Allow requests from frontend
app.use(cors({
  origin: '*', // Allow all origins for mobile development to avoid IP issues
  credentials: true
}));

// ============================================
// HEALTH CHECK ENDPOINT
// ============================================

app.get('/api/health', (req, res) => {
  res.json({
    status: 'RubberSense Backend is Running ✅',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// ============================================
// ROUTE REGISTRATION (Will add later)
// ============================================

app.use('/api/auth', authRoutes);
app.use('/api/trees', treeRoutes);
app.use('/api/scans', scanRoutes);
app.use('/api/latex', latexRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/posts', communityRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/v1/mail', mailRoutes);
app.use('/api/contact', contactRoutes);

// Compatibility aliases for the referenced web/backend model API.
app.use('/api/v1/users', authRoutes);
app.use('/api/v1/users', v1UsersCompatRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1', v1AnalysisCompatRoutes);
app.use('/api/v1/messages', messageRoutes);
app.use('/api/v1/community', communityRoutes);
app.use('/api/v1/upload', uploadCommunityRoutes);
app.use('/api/v1/sync', syncRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/contact', contactRoutes);

// ============================================
// ERROR HANDLING MIDDLEWARE
// ============================================

// 404 Not Found
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.path,
    method: req.method
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// SERVER START
// ============================================

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Connect to MongoDB first
    await connectDB();
    
    // Then start HTTP + Socket server
    const server = http.createServer(app);
    initializeSocket(server);

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`
╔════════════════════════════════════════════╗
║                                            ║
║   🌳 RUBBERSENSE BACKEND RUNNING 🌳       ║
║                                            ║
║   Server: http://localhost:${PORT}              ║
║   Environment: ${process.env.NODE_ENV || 'development'}       ║
║   Time: ${new Date().toLocaleTimeString()}          ║
║                                            ║
╚════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();

module.exports = app;
