const mongoose = require('mongoose');
const connectDB = require('../../src/models/db');
require('dotenv').config();

describe('Database Singleton', () => {
    let connection;

    beforeAll(async () => {
        connection = await connectDB();
    });

    afterAll(async () => {
        await mongoose.connection.close();
        global.mongoose = { conn: null, promise: null }; // Reset singleton for other tests
    });

    it('should maintain a single connection instance (singleton)', async () => {
        const conn1 = await connectDB();
        const conn2 = await connectDB();
        expect(conn1).toBe(conn2);
        expect(mongoose.connection.readyState).toBe(1); // 1 = connected
    });

    it('should have the default frame seeded', async () => {
        const Frame = require('../../src/models/Frame');
        const frame = await Frame.findOne({ file_path: '/assets/default-frame.png' });
        expect(frame).toBeDefined();
        expect(frame.is_active).toBe(true);
    });
});
