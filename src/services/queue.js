const { default: PQueue } = require('p-queue');
const logger = require('../utils/logger');
const Jimp = require('jimp');
const path = require('path');
const fs = require('fs');
const Pledge = require('../models/Pledge');
const Frame = require('../models/Frame');
const cache = require('./cache');

// Max 5 concurrent uploads processed
const queue = new PQueue({ concurrency: 5 });

const jobs = new Map();

const Job = require('../models/Job');

/**
 * Processes the photo: composites frame, saves to MongoDB, updates cache, emits socket.
 */
const processPhoto = async (jobId, { name, organisation, message, photoPath, io }) => {
    logger.info('⚙️ Starting processing for Job: %s (User: %s)', jobId, name);
    await Job.findOneAndUpdate({ jobId }, { status: 'processing' });

    try {
        const uploadsDir = path.join(__dirname, '../../uploads/photos');
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

        const filename = `pledge_${Date.now()}_${Math.round(Math.random() * 1E9)}.jpg`;
        const finalPath = path.join(uploadsDir, filename);
        const photoUrl = `/uploads/photos/${filename}`;

        // Get active frame from MongoDB
        const activeFrame = await Frame.findOne({ is_active: true }).lean();
        const framePath = activeFrame ? path.join(__dirname, '../../', activeFrame.file_path) : null;

        // Read user photo
        const image = await Jimp.read(photoPath);

        if (framePath && fs.existsSync(framePath)) {
            logger.debug('🖼️ Applying frame %s to Job: %s', activeFrame.name, jobId);
            const frame = await Jimp.read(framePath);

            // Frame dimensions become the final image size
            const fw = frame.bitmap.width;
            const fh = frame.bitmap.height;

            // The polaroid "window" (approximate percentages for standard polaroid)
            const photoX = Math.round(fw * 0.09);
            const photoY = Math.round(fh * 0.05);
            const photoW = Math.round(fw * 0.82);
            const photoH = Math.round(fh * 0.71);

            // Resize user photo to fill the window area
            image.cover(photoW, photoH);

            // Create blank white canvas at frame size
            const finalImg = await new Promise((resolve, reject) => {
                new Jimp(fw, fh, 0xFFFFFFFF, (err, img) => {
                    if (err) reject(err);
                    else resolve(img);
                });
            });

            // 1. Place photo inside the polaroid window
            finalImg.composite(image, photoX, photoY);
            // 2. Overlay frame on top (transparent center reveals photo)
            finalImg.composite(frame, 0, 0);

            // Resize for web delivery and save
            finalImg.resize(800, Jimp.AUTO);
            await finalImg.quality(80).writeAsync(finalPath);
        } else {
            // No frame available: just resize and save
            image.cover(800, 800);
            await image.quality(80).writeAsync(finalPath);
        }

        logger.debug('💾 Image optimized and saved: %s', photoUrl);

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
        logger.info('📝 Pledge saved to Database: %s', photoObj._id);

        // Notify wall and admin + cluster-wide cache update
        cache.addPhoto(photoObj); // Add to THIS worker's cache
        if (io) {
            io.serverSideEmit('add_to_cache', photoObj); // Sync to OTHER workers
            io.of('/wall').emit('new_photo', photoObj);
            io.of('/admin').emit('new_photo', photoObj);
            logger.debug('📣 Socket events emitted for Job: %s', jobId);
        }

        await Job.findOneAndUpdate({ jobId }, { status: 'done', photo: photoObj });

        // Clean up temp upload
        if (fs.existsSync(photoPath)) fs.unlinkSync(photoPath);

    } catch (err) {
        logger.error('❌ Queue processing error for Job %s: %o', jobId, err);
        await Job.findOneAndUpdate({ jobId }, { status: 'error', error: err.message });
    }
};

const addJob = async (jobData) => {
    const jobId = `job_${Date.now()}_${Math.round(Math.random() * 1e9)}`;
    const newJob = new Job({ jobId, status: 'queued' });
    await newJob.save();

    logger.info('📥 Job queued: %s (Queue size: %d)', jobId, queue.size + 1);
    queue.add(() => processPhoto(jobId, jobData));

    return jobId;
};

const getJobStatus = (jobId) => jobs.get(jobId);

const getQueueSize = () => queue.size + queue.pending;

module.exports = {
    addJob,
    getJobStatus,
    getQueueSize
};
