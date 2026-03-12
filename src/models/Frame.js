const mongoose = require('mongoose');

const frameSchema = new mongoose.Schema({
    name: { type: String },
    file_path: { type: String, required: true },
    is_active: { type: Boolean, default: false },
    created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Frame', frameSchema);
