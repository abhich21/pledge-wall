require('dotenv').config();
const http = require('http');
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;
const { Server } = require('socket.io');
const { setupWorker } = require('@socket.io/cluster-adapter');
const app = require('./src/app');
const connectDB = require('./src/models/db');
const cache = require('./src/services/cache');
const logger = require('./src/utils/logger');

const startServer = async () => {
    if (cluster.isMaster) {
        logger.info(`🏰 Master Process ${process.pid} is running`);

        // Connect DB once in master for seeding/cache init if needed
        // but workers will each have their own connection pool via Singleton
        await connectDB();
        await cache.initCache();

        // Fork workers
        for (let i = 0; i < numCPUs; i++) {
            cluster.fork();
        }

        cluster.on('exit', (worker) => {
            logger.warn(`⚠️ Worker ${worker.process.pid} died. Forking new worker...`);
            cluster.fork();
        });
    } else {
        // Worker Process
        await connectDB();

        const server = http.createServer(app);
        const io = new Server(server, {
            cors: { origin: "*" },
            transports: ['websocket'], // Enforce websocket for performance
            pingTimeout: 30000,
            pingInterval: 25000,
            maxHttpBufferSize: 1e6, // 1MB limit
            connectionStateRecovery: {
                maxDisconnectionDuration: 2 * 60 * 1000,
                skipMiddlewares: true,
            }
        });

        // Pass IO to app
        app.set('socketio', io);

        // Socket Namespaces
        io.of('/wall').on('connection', (socket) => {
            logger.debug(`📡 Socket connected to /wall: ${socket.id}`);
            socket.join('wall');
            socket.on('disconnect', () => logger.debug(`❌ Socket disconnected from /wall: ${socket.id}`));
        });

        io.of('/admin').on('connection', (socket) => {
            logger.debug(`🔐 Admin Socket connected: ${socket.id}`);
            socket.join('admin');
            socket.on('disconnect', () => logger.debug(`❌ Admin Socket disconnected: ${socket.id}`));
        });

        const PORT = process.env.PORT || 3000;
        server.listen(PORT, () => {
            logger.info(`🚀 Worker ${process.pid} started at http://localhost:${PORT}`);
        });
    }
};

startServer().catch(err => {
    logger.error('Failed to start server: %o', err);
});
