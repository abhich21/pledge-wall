require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const app = require('./src/app');
const connectDB = require('./src/models/db');
const cache = require('./src/services/cache');

const startServer = async () => {
    // 1. Connect to MongoDB
    await connectDB();

    // 2. Setup Server
    const server = http.createServer(app);
    const io = new Server(server, {
        cors: { origin: "*" },
        pingTimeout: 60000,
        pingInterval: 25000
    });

    // Pass IO to app
    app.set('socketio', io);

    // 3. Initialize Cache
    await cache.initCache();

    // 4. Socket Namespaces
    io.of('/wall').on('connection', (socket) => {
        socket.join('wall');
    });

    io.of('/admin').on('connection', (socket) => {
        socket.join('admin');
    });

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
        console.log(`\n🚀 BeTheChange Server (MongoDB) at: http://localhost:${PORT}`);
        console.log(`Press Ctrl+C to stop.\n`);
    });
};

startServer().catch(err => {
    console.error('Failed to start server:', err);
});
