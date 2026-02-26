/**
 * Socket.io server for real-time dashboard updates.
 */
import { Server } from 'socket.io';

let io = null;

let onConnection = null;

export function initSocket(httpServer, opts = {}) {
  io = new Server(httpServer, {
    cors: { origin: '*' },
    path: '/socket.io',
  });
  onConnection = opts.onConnection;
  io.on('connection', (socket) => {
    socket.emit('connected', { ts: new Date().toISOString() });
    onConnection?.(socket);
  });
  return io;
}

export function getIO() {
  return io;
}

export function emit(event, data) {
  io?.emit(event, data);
}
