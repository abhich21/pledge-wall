const request = require('supertest');
const app = require('../../src/app');
const mongoose = require('mongoose');
const connectDB = require('../../src/models/db');
const path = require('path');
const fs = require('fs');

describe('API Endpoints', () => {
    let server;

    beforeAll(async () => {
        await connectDB();
        // We'll use the main app for integration testing
    });

    afterAll(async () => {
        await mongoose.connection.close();
        global.mongoose = { conn: null, promise: null };
    });

    describe('GET /api/photos', () => {
        it('should return an array of photos from cache', async () => {
            const res = await request(app).get('/api/photos');
            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        });
    });

    describe('GET /api/frame/active', () => {
        it('should return the active frame URL', async () => {
            const res = await request(app).get('/api/frame/active');
            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('url');
        });
    });

    describe('Admin Authentication', () => {
        it('should fail with invalid credentials', async () => {
            const res = await request(app)
                .post('/api/admin/login')
                .send({ email: 'wrong@example.com', password: 'wrong' });
            expect(res.statusCode).toBe(401);
        });
    });

    // Note: /api/upload requires a real file. Skipping complex multipart test for now but checking endpoint exists.
    describe('POST /api/upload', () => {
        it('should return 400 if no photo provided', async () => {
            const res = await request(app)
                .post('/api/upload')
                .send({ name: 'Test' });
            expect(res.statusCode).toBe(400);
        });
    });
});
