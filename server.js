require('dotenv').config();
const http = require('http');
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;
const { Server } = require('socket.io');
const { createAdapter, setupPrimary } = require('@socket.io/cluster-adapter');
const app = require('./src/app');
const connectDB = require('./src/models/db');
const cache = require('./src/services/cache');
const logger = require('./src/utils/logger');

const logRoutes = (port) => {
    const baseUrl = `http://localhost:${port}`;
    logger.info('--- Frontend Routes ---');
    logger.info(`🏠 Home:      ${baseUrl}/`);
    logger.info(`📝 Pledge:    ${baseUrl}/pledge`);
    logger.info(`📸 Camera:    ${baseUrl}/camera`);
    logger.info(`✅ Success:   ${baseUrl}/success`);
    logger.info(`📺 Wall:      ${baseUrl}/wall`);
    logger.info(`🔐 Admin:     ${baseUrl}/admin`);
    logger.info(`📊 Dashboard: ${baseUrl}/admin/dashboard`);
    logger.info('-----------------------');
};

const startServer = async () => {
    const PORT = process.env.PORT || 3000;

    if (cluster.isMaster && numCPUs > 1) {
        logger.info(`🏰 Master Process ${process.pid} is running (Detected ${numCPUs} cores)`);
        logRoutes(PORT);

        // Required for Socket.io cluster adapter
        setupPrimary();

        // Fork workers
        for (let i = 0; i < numCPUs; i++) {
            cluster.fork();
        }

        cluster.on('exit', (worker) => {
            logger.warn(`⚠️ Worker ${worker.process.pid} died. Forking new worker...`);
            cluster.fork();
        });
    } else {
        // Worker Process (or Single Core)
        runWorker(PORT);
    }
};

const runWorker = async (PORT) => {
    try {
        // 1. Wait for DB and Cache BEFORE starting anything else
        await connectDB();
        await cache.initCache();

        const server = http.createServer(app);
        const io = new Server(server, {
            cors: { origin: "*" },
            transports: ['websocket'],
            pingTimeout: 30000,
            pingInterval: 25000,
            maxHttpBufferSize: 1e6,
            connectionStateRecovery: {
                maxDisconnectionDuration: 2 * 60 * 1000,
                skipMiddlewares: true,
            }
        });

        // Setup cluster adapter to sync across workers
        io.adapter(createAdapter());

        // Provide the io instance to Express app
        app.set('socketio', io);

        io.of('/wall').on('connection', (socket) => {
            logger.debug(`📡 Socket connected to /wall: ${socket.id}`);
            socket.join('wall');
        });

        io.of('/admin').on('connection', (socket) => {
            logger.debug(`🔐 Admin Socket connected: ${socket.id}`);
            socket.join('admin');
        });

        // --- NEW: Cluster-wide Cache Sync ---
        io.on('add_to_cache', (photo) => {
            logger.debug('📦 [Cluster Sync] Adding to local cache: %s', photo._id);
            cache.addPhoto(photo);
        });

        io.on('remove_from_cache', (id) => {
            logger.debug('📦 [Cluster Sync] Removing from local cache: %s', id);
            cache.removePhoto(id);
        });

        io.on('clear_cache', () => {
            logger.debug('📦 [Cluster Sync] Clearing local cache');
            cache.clearCache();
        });

        server.listen(PORT, () => {
            logger.info(`🚀 ${cluster.isMaster ? 'Single-Process' : 'Worker ' + process.pid} started at http://localhost:${PORT}`);
        });
    } catch (err) {
        logger.error(`❌ Worker failed to start: ${err.message}`);
        process.exit(1);
    }
};

startServer().catch(err => {
    logger.error('Failed to start server: %o', err);
});
