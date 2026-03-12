const Pledge = require('../models/Pledge');
const logger = require('../utils/logger');

let photoCache = [];

/**
 * Initialize cache from database on startup
 */
const initCache = async () => {
    try {
        const photos = await Pledge.find({ status: 'approved' })
            .sort({ created_at: -1 })
            .limit(500)
            .lean(); // Faster, returns plain JS objects

        photoCache = photos.reverse(); // Store in chronological order for easier wall appending
        logger.info(`✅ Cache initialized with ${photoCache.length} photos`);
    } catch (err) {
        logger.error('❌ Cache initialization error: %o', err);
    }
};

const getPhotos = () => photoCache;

const getPhotosSince = (timestamp) => {
    return photoCache.filter(p => new Date(p.created_at) > new Date(timestamp));
};

const addPhoto = (photo) => {
    photoCache.push(photo);
    if (photoCache.length > 500) {
        photoCache.shift(); // Keep only last 500
    }
};

const removePhoto = (id) => {
    photoCache = photoCache.filter(p => p._id.toString() !== id.toString());
};

const clearCache = () => {
    photoCache = [];
};

module.exports = {
    initCache,
    getPhotos,
    getPhotosSince,
    addPhoto,
    removePhoto,
    clearCache
};
