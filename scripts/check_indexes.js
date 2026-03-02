const mongoose = require('mongoose');
require('dotenv').config();
const connectDB = require('../config/database');

const checkIndexes = async () => {
  try {
    await connectDB();
    console.log('Connected to DB...');

    const collection = mongoose.connection.collection('trees');
    const indexes = await collection.indexes();
    console.log('Current Indexes:', JSON.stringify(indexes, null, 2));

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

checkIndexes();
