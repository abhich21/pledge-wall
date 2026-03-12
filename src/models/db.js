const mongoose = require('mongoose');
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
        console.log('✅ Connected to MongoDB (Singleton)');

        // Seed default frame if none exists
        const Frame = require('./Frame');
        const frameCount = await Frame.countDocuments();
        if (frameCount === 0) {
            await Frame.create({
                name: 'Default Polaroid',
                file_path: '/assets/default-frame.png',
                is_active: true
            });
            console.log('🌱 Default frame seeded');
        }
    } catch (err) {
        cached.promise = null;
        console.error('❌ MongoDB Connection Error:', err.message);
        process.exit(1);
    }
    return cached.conn;
};

module.exports = connectDB;
