import 'dotenv/config';
import { createServer } from 'http';
import WebSocket from 'ws';
import { OutgoingQueue } from './ocpp/queue.js';
import { parseMessage, MessageType } from './ocpp/message.js';
import { Simulator } from './simulator.js';
import { startHttpTrigger, startCliTrigger, createRequestHandler, TRIGGER_HTTP_PORT } from './triggers.js';
import { initSocket, emit } from './socket.js';
import { logger, logOcppMessage } from './lib/logger.js';
import {
  connectionConfig,
  buildWebSocketUrl,
  maskWebSocketUrlForLog,
} from './connection-config.js';

const OCPP_SUBPROTOCOL = 'ocpp1.6';

if (!connectionConfig.csmsUrl || !connectionConfig.chargePointId) {
  logger.warn(
    'CSMS_WS_URL and/or CHARGE_POINT_ID not set in environment. Configure via the web UI (Settings) or POST /config before connecting.'
  );
}

let currentSimulator = null;
let currentWs = null;
let manualDisconnect = false;
let autoConnect = process.env.AUTO_CONNECT !== 'false';
let lastHeartbeatAt = null;

const connectionController = {
  connect: null,
  disconnect: null,
  isConnected: () => currentWs?.readyState === WebSocket.OPEN,
};
const getSimulator = () => currentSimulator;
const log = (...args) => logger.info(...args);

function emitConnectionState() {
  emit('connection_state', { connected: connectionController.isConnected(), ts: new Date().toISOString() });
}
function emitOcppMessage(direction, raw, parsed) {
  emit('ocpp_message', { direction, ts: new Date().toISOString(), raw, action: parsed?.action, payload: parsed?.payload ?? parsed });
}
function emitSessionUpdate() {
  if (currentSimulator) {
    const status = currentSimulator.getStatus();
    emit('session_update', { ...status, connected: true, lastHeartbeatAt });
  } else {
    emit('session_update', { connected: false, connectors: [], lastHeartbeatAt: null });
  }
}
function emitMeterUpdate(connectorId, transactionId, meterWh, powerW) {
  emit('meter_update', { connectorId, transactionId, meterWh, powerW, ts: new Date().toISOString() });
}

function connect() {
  const cpId = connectionConfig.chargePointId.trim();
  const csms = connectionConfig.csmsUrl.trim();
  if (!cpId || !csms) {
    logger.warn('Cannot connect: set csmsUrl and chargePointId (Settings or POST /config / .env).');
    return;
  }

  let wsUrl;
  try {
    wsUrl = buildWebSocketUrl(connectionConfig);
  } catch (err) {
    logger.error('Invalid connection config:', err.message);
    return;
  }

  if (currentWs && (currentWs.readyState === WebSocket.OPEN || currentWs.readyState === WebSocket.CONNECTING)) {
    logger.warn('Already connected or connecting; skip duplicate connect.');
    return;
  }

  manualDisconnect = false;
  const safeLogUrl = maskWebSocketUrlForLog(wsUrl);
  logger.info(`Connecting to CSMS: ${safeLogUrl} (chargePointId=${cpId}, subprotocol=${OCPP_SUBPROTOCOL})`);
  const ws = new WebSocket(wsUrl, [OCPP_SUBPROTOCOL], { handshakeTimeout: 10000 });
  currentWs = ws;

  const rawSend = (data) => {
    if (ws.readyState === WebSocket.OPEN) {
      logOcppMessage('sent', data);
      let parsed;
      try { parsed = parseMessage(data); } catch { parsed = null; }
      emitOcppMessage('sent', data, parsed);
      if (parsed?.action === 'Heartbeat') lastHeartbeatAt = new Date().toISOString();
      ws.send(data);
    }
  };
  const queue = new OutgoingQueue(rawSend);

  const connectors = parseInt(process.env.NUMBER_OF_CONNECTORS, 10) || 2;
  const chargingSpeedKw = parseFloat(process.env.CHARGING_SPEED_KW, 10) || 7.4;
  const maxSessionDurationSec = parseInt(process.env.MAX_SESSION_DURATION_SEC, 10);
  const simulator = new Simulator(queue, cpId, {
    log,
    connectors,
    chargingSpeedKw,
    maxSessionDurationSec: Number.isFinite(maxSessionDurationSec) ? maxSessionDurationSec : 3600,
    profile: process.env.CHARGER_PROFILE,
    onEmit: (event, data) => {
      if (event === 'session_update') emitSessionUpdate();
      if (event === 'meter_update') emitMeterUpdate(data.connectorId, data.transactionId, data.meterWh, data.powerW);
    },
  });

  currentSimulator = simulator;
  emitConnectionState();
  emitSessionUpdate();

  ws.on('open', async () => {
    logger.info(`Connected to ${safeLogUrl} (charge point: ${cpId})`);
    emitConnectionState();
    try {
      let res = await simulator.sendBootNotification();
      while (res?.status === 'Pending' || res?.status === 'Rejected') {
        const retryIn = (res.retryIn ?? 60) * 1000;
        logger.info(`Boot ${res.status}, retrying in ${res.retryIn}s...`);
        await new Promise((r) => setTimeout(r, retryIn));
        res = await simulator.sendBootNotification();
      }
      emitSessionUpdate();
    } catch (err) {
      logger.error('BootNotification failed:', err.message);
      ws.close();
    }
  });

  ws.on('message', async (data) => {
    const raw = data.toString();
    logOcppMessage('received', raw);
    let msg;
    try {
      msg = parseMessage(data);
      if (msg.type === MessageType.CALLRESULT && msg.payload?.currentTime) lastHeartbeatAt = new Date().toISOString();
      emitOcppMessage('received', raw, msg);
    } catch (err) {
      logger.error('Parse error:', err.message);
      emitOcppMessage('received', raw, { error: err.message });
      return;
    }

    if (msg.type === MessageType.CALL) {
      const response = simulator.handleIncoming(msg.messageId, msg.action, msg.payload);
      rawSend(response);
      simulator.processPendingActions().catch((err) => logger.error('Pending actions error:', err.message));
      emitSessionUpdate();

      if (simulator.isResetRequested()) {
        simulator.stop();
        ws.close(1000, 'Reset');
      }
      return;
    }

    if (msg.type === MessageType.CALLRESULT) {
      if (queue.handleResult(msg.messageId, msg.payload)) {
        emitSessionUpdate();
        return;
      }
      logger.warn('Unexpected CALLRESULT for messageId:', msg.messageId);
      return;
    }

    if (msg.type === MessageType.CALLERROR) {
      if (queue.handleError(msg.messageId, msg.errorCode, msg.errorDescription, msg.errorDetails)) return;
      logger.warn('CALLERROR:', msg.errorCode, msg.errorDescription);
    }
  });

  ws.on('close', (code, reason) => {
    currentWs = null;
    currentSimulator = null;
    simulator.stop();
    emitConnectionState();
    emitSessionUpdate();
    logger.info(`Connection closed: ${code} ${reason?.toString() || ''}`);
    const wasReset = simulator.isResetRequested();
    if (wasReset) {
      simulator.clearResetRequested();
      logger.info('Reconnecting after reset...');
      setTimeout(connect, 2000);
    } else if (manualDisconnect) {
      manualDisconnect = false;
    } else if (autoConnect) {
      logger.info('Reconnecting in 3s...');
      setTimeout(connect, 3000);
    }
  });

  ws.on('error', (err) => {
    logger.error('WebSocket error:', err.message);
  });
}

function disconnect() {
  manualDisconnect = true;
  if (currentWs && currentWs.readyState !== WebSocket.CLOSED && currentWs.readyState !== WebSocket.CLOSING) {
    currentWs.close(1000, 'Manual disconnect');
  }
}
connectionController.connect = connect;
connectionController.disconnect = disconnect;

// Build request handler with static file serving
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const _dir = dirname(fileURLToPath(import.meta.url));
const serveStatic = existsSync(join(_dir, '../client/dist/index.html'));
const handler = createRequestHandler(getSimulator, connectionController, log, serveStatic, emitSessionUpdate);

const server = createServer(handler);
initSocket(server, {
  onConnection: () => {
    emitConnectionState();
    emitSessionUpdate();
  },
});
startHttpTrigger(getSimulator, connectionController, log, server, emitSessionUpdate);

const PORT = TRIGGER_HTTP_PORT > 0 ? TRIGGER_HTTP_PORT : 3000;
server.listen(PORT, () => {
  log(`Server: http://localhost:${PORT}/ (API + Socket.io; React at :5173 in dev)`);
});

startCliTrigger(getSimulator, log);

if (autoConnect && connectionConfig.csmsUrl && connectionConfig.chargePointId) {
  connect();
}
