/**
 * Shared Socket.io client initialization with reconnection logic from requirements.
 */
function initSocket(namespace = '/wall') {
    const socket = io(namespace, {
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000
    });

    socket.on('connect', () => {
        console.log(`Connected to ${namespace}`);
    });

    socket.on('reconnect', (attemptNumber) => {
        console.log(`Reconnected to ${namespace} after ${attemptNumber} attempts`);
        // Trigger manual sync if needed in specific pages
        const event = new CustomEvent('socket-reconnect', { detail: { namespace } });
        window.dispatchEvent(event);
    });

    socket.on('connect_error', (error) => {
        console.error(`Socket connection error for ${namespace}:`, error);
    });

    return socket;
}
