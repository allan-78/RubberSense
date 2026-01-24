// ============================================
// 🗄️ MongoDB Database Configuration
// ============================================

const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Connection options
    const options = {
      serverSelectionTimeoutMS: 30000, // Increased to 30s
      socketTimeoutMS: 45000,
    };

    // Connect to MongoDB
    const conn = await mongoose.connect(process.env.MONGODB_URI, options);

    console.log(`
╔════════════════════════════════════════════╗
║   ✅ MongoDB Connected Successfully        ║
║   Host: ${conn.connection.host.padEnd(29)} ║
║   Database: ${conn.connection.name.padEnd(24)} ║
╚════════════════════════════════════════════╝
    `);

  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error.message);
    console.error('⚠️  Check your MONGODB_URI in .env file');
    process.exit(1); // Exit process with failure
  }
};

// Handle connection events
mongoose.connection.on('disconnected', () => {
  console.log('⚠️  MongoDB disconnected. Attempting to reconnect...');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB error:', err);
});

module.exports = connectDB;
