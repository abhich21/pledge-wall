const mongoose = require('mongoose');
const logger = require('../utils/logger');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/pledge-wall';

// Singleton for DB connection
let cached = global.mongoose;

if (!cached) {
    cached = global.mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
    if (cached.conn) {
        return cached.conn;
    }

    if (!cached.promise) {
        const opts = {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
        };

        cached.promise = mongoose.connect(MONGO_URI, opts).then((m) => {
            return m;
        });
    }

    try {
        cached.conn = await cached.promise;
        logger.info('✅ Connected to MongoDB (Singleton)');

        const Frame = require('./Frame');
        const frameCount = await Frame.countDocuments();
        if (frameCount === 0) {
            await Frame.create({
                name: 'Default Polaroid',
                file_path: '/assets/default-frame.png',
                is_active: true
            });
            logger.info('🌱 Default frame seeded');
        }
    } catch (err) {
        cached.promise = null;
        logger.error('❌ MongoDB Connection Error: %o', err);
        process.exit(1);
    }
    return cached.conn;
};

module.exports = connectDB;
