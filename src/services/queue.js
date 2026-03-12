const { default: PQueue } = require('p-queue');
const Jimp = require('jimp');
const path = require('path');
const fs = require('fs');
const Pledge = require('../models/Pledge');
const Frame = require('../models/Frame');
const cache = require('./cache');

// Max 5 concurrent uploads processed
const queue = new PQueue({ concurrency: 5 });

const jobs = new Map();

/**
 * Processes the photo: composites frame, saves to MongoDB, updates cache, emits socket.
 */
const processPhoto = async (jobId, { name, organisation, message, photoPath, io }) => {
    jobs.set(jobId, { status: 'processing', progress: 0 });

    try {
        const uploadsDir = path.join(__dirname, '../../uploads/photos');
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

        const filename = `pledge_${Date.now()}_${Math.round(Math.random() * 1E9)}.jpg`;
        const finalPath = path.join(uploadsDir, filename);
        const photoUrl = `/uploads/photos/${filename}`;

        // Get active frame from MongoDB
        const activeFrame = await Frame.findOne({ is_active: true }).lean();
        const framePath = activeFrame ? path.join(__dirname, '../../public', activeFrame.file_path) : null;

        // Photo processing with Jimp
        const image = await Jimp.read(photoPath);
        image.cover(1200, 1200);

        if (framePath && fs.existsSync(framePath)) {
            const frame = await Jimp.read(framePath);
            frame.resize(1200, 1200);
            image.composite(frame, 0, 0);
        }

        await image.quality(85).writeAsync(finalPath);

        // Save to MongoDB
        const newPledge = new Pledge({
            name,
            organisation,
            message,
            photo_url: photoUrl,
            status: 'approved'
        });

        const savedPledge = await newPledge.save();
        const photoObj = savedPledge.toObject();

        // Update cache
        cache.addPhoto(photoObj);

        // Notify wall
        if (io) {
            io.of('/wall').emit('new_photo', photoObj);
        }

        jobs.set(jobId, { status: 'done', photo: photoObj });

        // Clean up temp upload
        if (fs.existsSync(photoPath)) fs.unlinkSync(photoPath);

    } catch (err) {
        console.error('❌ Queue processing error:', err);
        jobs.set(jobId, { status: 'error', error: err.message });
    }
};

const addJob = (jobData) => {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    jobs.set(jobId, { status: 'queued' });

    queue.add(() => processPhoto(jobId, jobData));

    return jobId;
};

const getJobStatus = (jobId) => jobs.get(jobId);

module.exports = {
    addJob,
    getJobStatus
};
