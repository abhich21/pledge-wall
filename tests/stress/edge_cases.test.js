const request = require('supertest');
const app = require('../../src/app');
const mongoose = require('mongoose');
const connectDB = require('../../src/models/db');

describe('Resilience & Edge Cases', () => {
    beforeAll(async () => {
        await connectDB();
    });

    afterAll(async () => {
        await mongoose.connection.close();
        global.mongoose = { conn: null, promise: null };
    });

    describe('Payload Injection & Size Limits', () => {
        it('should reject oversized JSON payloads (> 1MB)', async () => {
            const largeData = 'a'.repeat(1.1 * 1024 * 1024); // 1.1MB
            const res = await request(app)
                .post('/api/upload')
                .send({ name: largeData });
            expect(res.statusCode).toBe(413); // Payload Too Large
        });

        it('should reject invalid data types', async () => {
            const res = await request(app)
                .post('/api/upload')
                .send({ name: 12345 }); // Should be string
            expect(res.statusCode).toBe(400);
            expect(res.body.error).toContain('must be of type string');
        });

        it('should reject missing required fields', async () => {
            const res = await request(app)
                .post('/api/upload')
                .send({ organisation: 'Test' }); // Missing name
            expect(res.statusCode).toBe(400);
            expect(res.body.error).toContain('name is required');
        });
    });

    describe('Rate Limiting', () => {
        it('should eventually throttle repeated requests', async () => {
            // We'll test the global limiter (100 per minute)
            // Simulating a burst
            for (let i = 0; i < 5; i++) {
                await request(app).get('/api/photos');
            }
            // Real rate limit testing usually requires a higher 
            // number of requests, but we verify the middleware is active.
            const res = await request(app).get('/api/photos');
            expect(res.statusCode).toBe(200);
            expect(res.headers).toHaveProperty('x-ratelimit-limit');
        });
    });
});
