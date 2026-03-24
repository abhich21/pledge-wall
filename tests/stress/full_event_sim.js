const { io } = require('socket.io-client');
const Jimp = require('jimp');

const BASE_URL = 'http://localhost:3000';
const SOCKET_URL = 'http://localhost:3000/wall';
const TOTAL_UPLOADS = 500;
const CONCURRENT_UPLOADS = 15;
const TOTAL_VIEWERS = 100;

const metrics = {
    uploadsStarted: 0,
    uploadsFinished: 0,
    uploadsFailed: 0,
    socketMessagesReceived: 0,
    avgUploadTime: 0,
    startTime: Date.now()
};

// 1. Setup Socket Listeners (The "Wall Viewers")
const setupViewers = () => {
    console.log(`📡 Connecting ${TOTAL_VIEWERS} simulated wall viewers...`);
    for (let i = 0; i < TOTAL_VIEWERS; i++) {
        const socket = io(SOCKET_URL, { transports: ['websocket'] });
        socket.on('new_photo', () => {
            metrics.socketMessagesReceived++;
        });
    }
};

const startStressTest = async () => {
    // 2. Generate a TRULY valid JPEG buffer using Jimp
    console.log('🖼️ Generating valid mock JPEG...');
    const mockImage = await new Promise((resolve, reject) => {
        new Jimp(100, 100, 0x000000ff, (err, image) => {
            if (err) reject(err);
            image.getBuffer(Jimp.MIME_JPEG, (err, buffer) => {
                if (err) reject(err);
                else resolve(buffer);
            });
        });
    });

    setupViewers();

    console.log(`\n🚀 Starting Stress Test: ${TOTAL_UPLOADS} uploads, ${CONCURRENT_UPLOADS} at a time...`);

    const startTime = Date.now();

    const uploadPhoto = async (id) => {
        const start = Date.now();
        const formData = new FormData();

        const blob = new Blob([mockImage], { type: 'image/jpeg' });
        formData.append('photo', blob, `sim_${id}.jpg`);
        formData.append('name', `User ${id}`);
        formData.append('organisation', 'Stress Test Org');
        formData.append('message', `Pledge #${id} from stress test!`);

        try {
            metrics.uploadsStarted++;
            const res = await fetch(`${BASE_URL}/api/upload`, {
                method: 'POST',
                body: formData
            });

            if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
            const data = await res.json();
            const jobId = data.jobId;

            // Poll for completion
            let done = false;
            while (!done) {
                await new Promise(r => setTimeout(r, 1000));
                const statusRes = await fetch(`${BASE_URL}/api/upload/status/${jobId}`);
                if (!statusRes.ok) throw new Error(`Status HTTP Error ${statusRes.status}`);
                const statusData = await statusRes.json();

                if (statusData.status === 'done') {
                    done = true;
                    metrics.uploadsFinished++;
                    const duration = Date.now() - start;
                    metrics.avgUploadTime = (metrics.avgUploadTime * (metrics.uploadsFinished - 1) + duration) / metrics.uploadsFinished;
                } else if (statusData.status === 'error') {
                    throw new Error(statusData.error);
                }
            }
        } catch (err) {
            metrics.uploadsFailed++;
            console.error(`❌ Upload ${id} failed: ${err.message}`);
        }
    };

    // Process in batches
    for (let i = 0; i < TOTAL_UPLOADS; i += CONCURRENT_UPLOADS) {
        const batch = [];
        for (let j = 0; j < CONCURRENT_UPLOADS && (i + j) < TOTAL_UPLOADS; j++) {
            batch.push(uploadPhoto(i + j));
        }
        await Promise.all(batch);

        const progress = Math.round(((i + CONCURRENT_UPLOADS) / TOTAL_UPLOADS) * 100);
        const elapsed = (Date.now() - startTime) / 1000;
        console.log(`📊 Progress: ${progress}% | Duration: ${elapsed.toFixed(1)}s | Avg processing: ${(metrics.avgUploadTime / 1000).toFixed(2)}s | Sockets Sync'd: ${metrics.socketMessagesReceived}`);
    }

    const totalTime = (Date.now() - startTime) / 1000;

    console.log('\n✅ --- STRESS TEST REPORT ---');
    console.log(`Total Duration: ${totalTime.toFixed(2)}s`);
    console.log(`Total Uploads: ${metrics.uploadsFinished}/${TOTAL_UPLOADS}`);
    console.log(`Failures: ${metrics.uploadsFailed}`);
    console.log(`Average Processing Time: ${(metrics.avgUploadTime / 1000).toFixed(2)}s`);
    console.log(`Total Socket Sync Events: ${metrics.socketMessagesReceived}`);
    console.log('-----------------------------\n');

    process.exit(0);
};

startStressTest().catch(err => {
    console.error('Fatal Stress Test Error:', err);
    process.exit(1);
});
