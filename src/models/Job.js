const mongoose = require('mongoose');

const JobSchema = new mongoose.Schema({
    jobId: { type: String, required: true, unique: true },
    status: { type: String, enum: ['queued', 'processing', 'done', 'error'], default: 'queued' },
    progress: { type: Number, default: 0 },
    error: { type: String },
    photo: { type: Object },
    created_at: { type: Date, default: () => new Date(Date.now() + 5.5 * 60 * 60 * 1000), expires: 3600 }
});

module.exports = mongoose.model('Job', JobSchema);
