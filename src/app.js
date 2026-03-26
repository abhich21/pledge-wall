const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const fs = require('fs');
const morgan = require('morgan');
const compression = require('compression');
const logger = require('./utils/logger');

const { verifyToken, signToken } = require('./middleware/auth');
const Pledge = require('./models/Pledge');
const Frame = require('./models/Frame');
const cache = require('./services/cache');
const queue = require('./services/queue');
const Job = require('./models/Job');

const app = express();

/**
 * Payload Validator Utility
 */
const validatePayload = (data, schema) => {
    for (const key in schema) {
        if (schema[key].required && (data[key] === undefined || data[key] === null || data[key] === '')) {
            throw new Error(`Field ${key} is required`);
        }
        if (data[key] && typeof data[key] !== schema[key].type) {
            throw new Error(`Field ${key} must be of type ${schema[key].type}`);
        }
        if (data[key] && schema[key].maxLength && data[key].length > schema[key].maxLength) {
            throw new Error(`Field ${key} exceeds maximum length of ${schema[key].maxLength}`);
        }
    }
    return true;
};

// Middleware
app.use(compression());
app.use(morgan(':method :url :status :response-time ms', { stream: { write: (message) => logger.info(message.trim()) } }));
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Health check — must be before rate limiter so it is never blocked
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Rate Limiting
const globalLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 100,
    message: { error: "Too many requests." }
});
app.use(globalLimiter);

const uploadLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 3,
    message: { error: "Too many uploads." }
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: "Too many login attempts." }
});

// Multer
const upload = multer({
    dest: 'uploads/temp/',
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Static
const rootDir = path.join(__dirname, '..');
app.use(express.static(path.join(rootDir, 'public'), { maxAge: '2h' }));
app.use('/uploads', express.static(path.join(rootDir, 'uploads'), { maxAge: '24h', immutable: true }));

// Set IO on app for use in routes
app.set('socketio', null);

// --- FRONTEND ROUTES ---
app.get('/', (req, res) => res.sendFile(path.join(rootDir, 'public', 'index.html')));
app.get('/pledge', (req, res) => res.sendFile(path.join(rootDir, 'public', 'pledge.html')));
app.get('/camera', (req, res) => res.sendFile(path.join(rootDir, 'public', 'camera.html')));
app.get('/success', (req, res) => res.sendFile(path.join(rootDir, 'public', 'success.html')));
app.get('/wall', (req, res) => res.sendFile(path.join(rootDir, 'public', 'wall.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(rootDir, 'public', 'admin', 'index.html')));
app.get('/admin/dashboard', (req, res) => res.sendFile(path.join(rootDir, 'public', 'admin', 'dashboard.html')));

// --- PUBLIC API ---

app.get('/api/photos', (req, res) => res.json(cache.getPhotos()));

app.get('/api/photos/since/:timestamp', (req, res) => {
    res.json(cache.getPhotosSince(req.params.timestamp));
});

app.get('/api/frame/active', async (req, res) => {
    try {
        const frame = await Frame.findOne({ is_active: true }).lean();
        res.json({ url: frame ? frame.file_path : '/assets/default-frame.png' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/upload', uploadLimiter, upload.single('photo'), async (req, res) => {
    try {
        const { name, organisation, message } = req.body;

        validatePayload(req.body, {
            name: { type: 'string', required: true, maxLength: 50 },
            organisation: { type: 'string', maxLength: 50 },
            message: { type: 'string', maxLength: 200 }
        });

        if (!req.file) return res.status(400).json({ error: 'Photo required' });

        const jobId = await queue.addJob({
            name, organisation, message,
            photoPath: req.file.path,
            io: app.get('socketio')
        });
        res.status(202).json({ jobId });
    } catch (err) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(400).json({ error: err.message });
    }
});

app.get('/api/upload/status/:jobId', async (req, res) => {
    try {
        const job = await Job.findOne({ jobId: req.params.jobId }).lean();
        if (!job) return res.status(404).json({ error: 'Job not found' });

        res.json({
            ...job,
            queueSize: queue.getQueueSize()
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin
app.post('/api/admin/login', loginLimiter, (req, res) => {
    const { email, password } = req.body;
    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
        logger.info('🔐 Admin login success for: %s', email);
        return res.json({ token: signToken({ email }) });
    }
    logger.warn('⚠️ Admin login failed for: %s', email);
    res.status(401).json({ error: 'Invalid credentials' });
});

app.get('/api/admin/verify', verifyToken, (req, res) => res.json({ valid: true }));

app.get('/api/admin/photos', verifyToken, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;

        const photos = await Pledge.find()
            .sort({ created_at: -1 })
            .skip(offset)
            .limit(limit)
            .lean();

        logger.debug('📷 Fetched %d photos for admin (offset: %d, limit: %d)', photos.length, offset, limit);
        res.json(photos);
    } catch (err) {
        logger.error('❌ Failed to fetch admin photos: %o', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/stats', verifyToken, async (req, res) => {
    try {
        const [total, approved, rejected, archived] = await Promise.all([
            Pledge.countDocuments(),
            Pledge.countDocuments({ status: 'approved' }),
            Pledge.countDocuments({ status: 'rejected' }),
            Pledge.countDocuments({ status: 'archived' })
        ]);
        res.json({ total, approved, rejected, archived });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/admin/photos/:id/status', verifyToken, async (req, res) => {
    const { status } = req.body;
    const { id } = req.params;

    if (!['approved', 'rejected', 'archived'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    try {
        const photo = await Pledge.findByIdAndUpdate(id, { status }, { new: true }).lean();
        if (!photo) return res.status(404).json({ error: 'Not found' });

        logger.info('⚖️ Photo %s status changed to %s', id, status);

        const io = app.get('socketio');
        if (status === 'approved') {
            cache.addPhoto(photo); // Add to THIS worker's cache
            if (io) {
                io.serverSideEmit('add_to_cache', photo); // Sync to OTHER workers
                io.of('/wall').emit('new_photo', photo);
                io.of('/admin').emit('photo_updated', photo);
            }
        } else {
            cache.removePhoto(id); // Remove from THIS worker's cache
            if (io) {
                io.serverSideEmit('remove_from_cache', id); // Sync to OTHER workers
                io.of('/wall').emit('photo_deleted', { id });
                io.of('/admin').emit('photo_updated', photo);
            }
        }
        res.json({ message: 'Updated' });
    } catch (err) {
        logger.error('❌ Failed to update photo status: %o', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/photos/archive-all', verifyToken, async (req, res) => {
    try {
        await Pledge.updateMany({ status: 'approved' }, { status: 'archived' });
        const io = app.get('socketio');
        if (io) {
            io.serverSideEmit('clear_cache');
            io.of('/wall').emit('wall_cleared');
        }
        logger.info('📦 All approved photos archived');
        res.json({ message: 'All photos archived' });
    } catch (err) {
        logger.error('❌ Failed to archive photos: %o', err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/admin/photos/delete-all', verifyToken, async (req, res) => {
    try {
        const photos = await Pledge.find().lean();
        for (const photo of photos) {
            const fullPath = path.join(__dirname, '..', photo.photo_url);
            if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        }
        await Pledge.deleteMany({});
        const io = app.get('socketio');
        if (io) {
            io.serverSideEmit('clear_cache');
            io.of('/wall').emit('wall_cleared');
        }
        logger.info('🗑️ All photos deleted from DB and Disk');
        res.json({ message: 'All photos deleted' });
    } catch (err) {
        logger.error('❌ Failed to delete all photos: %o', err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/admin/photos/:id', verifyToken, async (req, res) => {
    const { id } = req.params;
    try {
        const photo = await Pledge.findByIdAndDelete(id).lean();
        if (photo) {
            const fullPath = path.join(__dirname, '..', photo.photo_url);
            if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
            logger.info('🗑️ Photo %s deleted and file removed', id);
        }
        cache.removePhoto(id);
        const io = app.get('socketio');
        if (io) {
            io.of('/wall').emit('photo_deleted', { id });
            io.of('/admin').emit('photo_deleted', { id });
        }
        res.json({ message: 'Deleted' });
    } catch (err) {
        logger.error('❌ Failed to delete photo: %o', err);
        res.status(500).json({ error: err.message });
    }
});

// --- ADMIN FRAME ROUTES ---

app.post('/api/admin/frame', verifyToken, upload.single('frame'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Frame file required' });

        // Enforce single active frame: Delete old frames
        const oldFrames = await Frame.find();
        for (const f of oldFrames) {
            // Strip leading slash if present to avoid absolute path joining issues
            const relativePath = f.file_path.startsWith('/') ? f.file_path.substring(1) : f.file_path;
            const oldPath = path.join(rootDir, relativePath);
            if (fs.existsSync(oldPath)) {
                try { fs.unlinkSync(oldPath); } catch (e) { logger.error('Failed to delete old frame file: %o', e); }
            }
        }
        await Frame.deleteMany({});

        const framesDir = path.join(rootDir, 'uploads', 'frames');
        if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir, { recursive: true });

        const filename = `frame_${Date.now()}.png`;
        const finalPath = path.join(framesDir, filename);
        const filePath = `/uploads/frames/${filename}`;

        fs.renameSync(req.file.path, finalPath);

        const newFrame = new Frame({
            name: req.file.originalname,
            file_path: filePath,
            is_active: true
        });

        await newFrame.save();
        logger.info('🖼️ New active frame uploaded into root: %s', filePath);
        res.json({ message: 'Frame updated', url: filePath });
    } catch (err) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        logger.error('❌ Frame upload failed: %o', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/frame/reset', verifyToken, async (req, res) => {
    try {
        const oldFrames = await Frame.find();
        for (const f of oldFrames) {
            const relativePath = f.file_path.startsWith('/') ? f.file_path.substring(1) : f.file_path;
            const oldPath = path.join(rootDir, relativePath);
            if (fs.existsSync(oldPath)) {
                try { fs.unlinkSync(oldPath); } catch (e) { logger.error('Failed to delete old frame file: %o', e); }
            }
        }
        await Frame.deleteMany({});
        logger.info('🔄 Frame reset to default');
        res.json({ message: 'Frame reset to default' });
    } catch (err) {
        logger.error('❌ Frame reset failed: %o', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = app;
