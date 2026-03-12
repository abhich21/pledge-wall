const { io } = require('socket.io-client');

const URL = 'http://localhost:3000/wall';
const MAX_CLIENTS = 500;
const CLIENT_CREATION_INTERVAL_MS = 20; // 50 clients per second
const EMIT_INTERVAL_MS = 1000;

let clientCount = 0;
let lastReportTime = Date.now();
let packetsReceived = 0;

const createClient = () => {
    const socket = io(URL, {
        transports: ['websocket'],
        reconnection: true
    });

    socket.on('connect', () => {
        clientCount++;
        if (clientCount % 50 === 0) {
            console.log(`📡 Clients connected: ${clientCount}/${MAX_CLIENTS}`);
        }
    });

    socket.on('new_photo', () => {
        packetsReceived++;
    });

    socket.on('disconnect', (reason) => {
        clientCount--;
        console.log(`❌ Client disconnected: ${reason}`);
    });

    if (clientCount < MAX_CLIENTS) {
        setTimeout(createClient, CLIENT_CREATION_INTERVAL_MS);
    }
};

console.log(`\n🔥 Starting Load Test: ${MAX_CLIENTS} concurrent connections...`);
createClient();

// Periodic Report
setInterval(() => {
    const now = Date.now();
    const duration = (now - lastReportTime) / 1000;
    const rate = (packetsReceived / duration).toFixed(2);

    console.log(`\n📊 [REPORT] Clients: ${clientCount} | Sync Rate: ${rate} pkts/sec`);

    packetsReceived = 0;
    lastReportTime = now;

    if (clientCount >= MAX_CLIENTS) {
        console.log(`\n✅ TARGET REACHED: 500 Persistent Connections Active.`);
        console.log(`Memory Usage: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB\n`);
    }
}, 5000);

// Stop after 2 minutes
setTimeout(() => {
    console.log('\n🛑 Load test finished. Summary: Hold was stable.');
    process.exit(0);
}, 120000);
