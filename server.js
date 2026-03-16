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

    // Connect DB and Init Cache for the current process (Master or Single)
    await connectDB();
    await cache.initCache();

    if (numCPUs <= 1) {
        logger.info('⚙️ Single core detected. Running in single-process mode.');
        logRoutes(PORT);
        runWorker();
        return;
    }

    if (cluster.isMaster) {
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
        // Redundant call for clarity in clustered workers
        runWorker();
    }
};

const runWorker = () => {
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

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
        logger.info(`🚀 ${cluster.isMaster ? 'Single-Process' : 'Worker ' + process.pid} started at http://localhost:${PORT}`);
    });
};

startServer().catch(err => {
    logger.error('Failed to start server: %o', err);
});
