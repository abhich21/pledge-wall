require('dotenv').config();
const mongoose = require('mongoose');
const Pledge = require('../src/models/Pledge');

// Use an existing processed photo for the dummy data
const DUMMY_PHOTO_URL = '/uploads/photos/pledge_1774510155739_860185293.jpg';

const FIRST_NAMES = [
    'Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'Oliver', 'Isabella', 'William', 'Sophia', 'Elijah',
    'Mia', 'James', 'Charlotte', 'Benjamin', 'Amelia', 'Lucas', 'Harper', 'Henry', 'Evelyn', 'Alexander'
];

const LAST_NAMES = [
    'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
    'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin'
];

const MESSAGES = [
    'Empowered women empower women!',
    'Here\'s to strong women: May we know them, may we be them.',
    'I pledge to support equality every single day.',
    'Breaking the bias, one step at a time.',
    'Proud to stand with all women today and always.',
    'Equal rights, equal opportunities.',
    'My pledge: To always uplift and amplify women\'s voices.',
    'Happy Women\'s Day! Keep shining brightly.',
    'Together we can achieve anything.',
    'Celebrating the achievements of women everywhere.'
];

const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

const seedDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const pledges = [];
        for (let i = 0; i < 50; i++) {
            pledges.push({
                name: `${getRandom(FIRST_NAMES)} ${getRandom(LAST_NAMES)}`,
                organisation: 'BeTheChange Corp',
                message: getRandom(MESSAGES),
                photo_url: DUMMY_PHOTO_URL,
                status: 'approved',
                created_at: new Date(Date.now() - Math.random() * 10000000) // Slightly spread out times
            });
        }

        await Pledge.insertMany(pledges);
        console.log('✅ Successfully inserted 50 dummy pledges');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error seeding:', err);
        process.exit(1);
    }
};

seedDB();
