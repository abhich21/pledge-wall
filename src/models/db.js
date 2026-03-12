const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/pledge-wall';

const connectDB = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');

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
        console.error('❌ MongoDB Connection Error:', err.message);
        process.exit(1);
    }
};

module.exports = connectDB;
