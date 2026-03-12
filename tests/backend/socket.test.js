const { io } = require('socket.io-client');
const http = require('http');
const { Server } = require('socket.io');
const app = require('../../src/app');
const mongoose = require('mongoose');
const connectDB = require('../../src/models/db');

describe('Socket.io Real-time & Persistence', () => {
    let ioServer, server, clientSocket;
    const PORT = 3001;

    jest.setTimeout(20000); // Increase timeout for socket connection

    beforeAll((done) => {
        server = http.createServer(app);
        ioServer = new Server(server, {
            connectionStateRecovery: {
                maxDisconnectionDuration: 2 * 60 * 1000,
                skipMiddlewares: true
            }
        });

        // Define namespace behavior
        ioServer.of('/wall').on('connection', (socket) => {
            socket.join('wall');
        });

        app.set('socketio', ioServer);

        server.listen(PORT, async () => {
            try {
                await connectDB();
                clientSocket = io(`http://localhost:${PORT}/wall`, {
                    transports: ['websocket'],
                    reconnectionDelay: 100,
                    reconnectionDelayMax: 500,
                    randomizationFactor: 0
                });

                clientSocket.on('connect', () => {
                    done();
                });

                clientSocket.on('connect_error', (err) => {
                    console.error('Socket Connection Error:', err);
                    done(err);
                });
            } catch (err) {
                done(err);
            }
        });
    });

    afterAll(async () => {
        if (clientSocket) clientSocket.disconnect();
        if (ioServer) ioServer.close();
        if (server) server.close();
        await mongoose.connection.close();
        global.mongoose = { conn: null, promise: null };
    });

    it('should receive new_photo events in real-time', (done) => {
        const testPhoto = { id: '123', name: 'Test User', photo_url: '/test.jpg' };

        clientSocket.on('new_photo', (data) => {
            expect(data.name).toBe('Test User');
            done();
        });

        // Emit to the specific namespace
        ioServer.of('/wall').emit('new_photo', testPhoto);
    });

    it('should support connection recovery window (conceptual check)', () => {
        expect(ioServer.opts.connectionStateRecovery.maxDisconnectionDuration).toBe(120000);
    });
});
