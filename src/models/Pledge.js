const mongoose = require('mongoose');

const pledgeSchema = new mongoose.Schema({
    name: { type: String, required: true },
    organisation: { type: String },
    message: { type: String },
    photo_url: { type: String, required: true },
    status: {
        type: String,
        default: 'approved',
        enum: ['approved', 'rejected', 'archived']
    },
    created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Pledge', pledgeSchema);
