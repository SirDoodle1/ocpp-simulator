/**
 * HTTP control API and CLI triggers for the OCPP simulator.
 */
import { createServer } from 'http';
import { createInterface } from 'readline';
import { readFileSync, existsSync } from 'fs';
import { join, dirname, extname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.TRIGGER_HTTP_PORT ?? '3000', 10);

async function readBody(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  return body;
}

function jsonResponse(res, status, data) {
  res.setHeader('Content-Type', 'application/json');
  res.writeHead(status);
  res.end(JSON.stringify(data));
}

export function createRequestHandler(getSimulator, connectionController, log, serveStatic, onActionComplete = null) {
  return async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost`);
    const path = url.pathname;

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Serve React build in production
    if (serveStatic && path.startsWith('/') && req.method === 'GET') {
      const distDir = join(__dirname, '../client/dist');
      const safePath = path === '/' ? 'index.html' : path.slice(1).replace(/\.\./g, '');
      const filePath = join(distDir, safePath);
      if (!resolve(filePath).startsWith(resolve(distDir))) return;
      const ext = extname(filePath);
      const contentType = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.json': 'application/json' }[ext] || 'application/octet-stream';
      if (existsSync(filePath)) {
        try {
          const data = readFileSync(filePath);
          res.setHeader('Content-Type', contentType);
          res.writeHead(200);
          res.end(data);
          return;
        } catch { /* fall through */ }
      }
      if (path === '/') {
        res.setHeader('Content-Type', 'text/html');
        res.writeHead(200);
        res.end('<html><body><h1>OCPP Simulator API</h1><p>Dashboard: <a href="http://localhost:5173">http://localhost:5173</a></p></body></html>');
        return;
      }
    }
    if (path === '/' && req.method === 'GET') {
      res.setHeader('Content-Type', 'text/html');
      res.writeHead(200);
      res.end('<html><body><h1>OCPP Simulator API</h1><p>Dashboard: <a href="http://localhost:5173">http://localhost:5173</a></p></body></html>');
      return;
    }

    const simulator = getSimulator();

    if (path === '/profiles' && req.method === 'GET') {
      const { listProfiles } = await import('./profiles.js');
      jsonResponse(res, 200, { profiles: listProfiles() });
      return;
    }

    if (path === '/status' && req.method === 'GET') {
      const connected = connectionController?.isConnected?.() ?? !!simulator;
      if (!simulator) {
        jsonResponse(res, 200, { connected: false });
        return;
      }
      const status = simulator.getStatus();
      jsonResponse(res, 200, { ...status, connected: true });
      return;
    }

    if (path === '/connect' && req.method === 'POST') {
      try {
        connectionController?.connect?.();
        jsonResponse(res, 200, { ok: true, message: 'Connecting...' });
      } catch (err) {
        jsonResponse(res, 500, { ok: false, error: err.message });
      }
      return;
    }

    if (path === '/disconnect' && req.method === 'POST') {
      try {
        connectionController?.disconnect?.();
        jsonResponse(res, 200, { ok: true, message: 'Disconnected' });
      } catch (err) {
        jsonResponse(res, 500, { ok: false, error: err.message });
      }
      return;
    }

    if (!simulator) {
      jsonResponse(res, 503, { ok: false, error: 'Not connected to CSMS' });
      return;
    }

    if (path === '/plug-in' && req.method === 'POST') {
      const body = await readBody(req);
      const { connectorId = 1 } = JSON.parse(body || '{}');
      const result = simulator.plugIn(parseInt(connectorId, 10) || 1);
      if (result.ok) onActionComplete?.();
      jsonResponse(res, result.ok ? 200 : 400, result);
      return;
    }

    if (path === '/plug-out' && req.method === 'POST') {
      const body = await readBody(req);
      const { connectorId = 1 } = JSON.parse(body || '{}');
      const result = simulator.plugOut(parseInt(connectorId, 10) || 1);
      if (result.ok) onActionComplete?.();
      jsonResponse(res, result.ok ? 200 : 400, result);
      return;
    }

    if ((path === '/start-session' || path === '/sessions/start') && req.method === 'POST') {
      const body = await readBody(req);
      const { connectorId = 1, idTag = 'HTTP-RFID' } = JSON.parse(body || '{}');
      const result = await simulator.startSession(parseInt(connectorId, 10) || 1, idTag);
      if (result.ok) onActionComplete?.();
      jsonResponse(res, result.ok ? 200 : 400, result);
      return;
    }

    if ((path === '/stop-session' || path === '/sessions/stop') && req.method === 'POST') {
      const body = await readBody(req);
      const { connectorId, transactionId, reason = 'Local' } = JSON.parse(body || '{}');
      let result;
      if (transactionId) result = await simulator.stopSessionByTransactionId(transactionId, reason);
      else result = await simulator.stopSession(parseInt(connectorId, 10) || 1, reason);
      if (result.ok) onActionComplete?.();
      jsonResponse(res, result.ok ? 200 : 400, result);
      return;
    }

    if (path === '/fault' && req.method === 'POST') {
      const body = await readBody(req);
      const { connectorId = 1 } = JSON.parse(body || '{}');
      const result = simulator.setFault(parseInt(connectorId, 10) || 1);
      if (result.ok) onActionComplete?.();
      jsonResponse(res, result.ok ? 200 : 400, result);
      return;
    }

    if (path === '/available' && req.method === 'POST') {
      const body = await readBody(req);
      const { connectorId } = JSON.parse(body || '{}');
      const result = simulator.setAvailable(connectorId != null ? parseInt(connectorId, 10) : undefined);
      if (result.ok) onActionComplete?.();
      jsonResponse(res, 200, result);
      return;
    }

    const setProfileMatch = path.match(/^\/set-profile\/([a-zA-Z0-9_]+)$/);
    if (setProfileMatch && req.method === 'POST') {
      const profileName = setProfileMatch[1];
      const result = simulator.setProfile(profileName);
      if (result.ok) onActionComplete?.();
      jsonResponse(res, result.ok ? 200 : 400, result);
      return;
    }

    jsonResponse(res, 404, { error: 'Not found' });
  };
}

export const TRIGGER_HTTP_PORT = PORT;

export function startHttpTrigger(getSimulator, connectionController, log, httpServer = null, onActionComplete = null) {
  if (PORT <= 0) return null;

  const serveStatic = existsSync(join(__dirname, '../client/dist/index.html'));
  const handler = createRequestHandler(getSimulator, connectionController, log, serveStatic, onActionComplete);

  const server = httpServer || createServer(handler);
  return server;
}

export function startCliTrigger(getSimulator, log) {
  if (!process.stdin.isTTY) return null;

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const help = () => {
    log('Commands: start <connector> [idTag] | stop <connector> | status | help');
  };

  rl.on('line', async (line) => {
    const simulator = getSimulator();
    if (!simulator) {
      log('Not connected to CSMS');
      return;
    }
    const parts = line.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return;

    const [cmd, arg1, arg2] = parts;
    switch (cmd.toLowerCase()) {
      case 'start': {
        const connectorId = parseInt(arg1, 10);
        const idTag = arg2 ?? 'CLI-RFID';
        if (!connectorId || connectorId < 1) {
          log('Usage: start <connector> [idTag]');
          return;
        }
        const r = await simulator.startSession(connectorId, idTag);
        log(r.ok ? `Started: transactionId=${r.transactionId}` : `Error: ${r.error}`);
        break;
      }
      case 'stop': {
        const connectorId = parseInt(arg1, 10);
        if (!connectorId || connectorId < 1) {
          log('Usage: stop <connector>');
          return;
        }
        const r = await simulator.stopSession(connectorId);
        log(r.ok ? 'Stopped' : `Error: ${r.error}`);
        break;
      }
      case 'status': {
        const s = simulator.getStatus();
        log(JSON.stringify(s, null, 2));
        break;
      }
      case 'help':
        help();
        break;
      default:
        log(`Unknown command: ${cmd}`);
        help();
    }
  });

  help();
  return rl;
}
