const mongoose = require('mongoose');

const frameSchema = new mongoose.Schema({
    name: { type: String },
    file_path: { type: String, required: true },
    is_active: { type: Boolean, default: false },
    created_at: {
        type: Date,
        default: () => new Date(Date.now() + 5.5 * 60 * 60 * 1000)
    }
});

module.exports = mongoose.model('Frame', frameSchema);
