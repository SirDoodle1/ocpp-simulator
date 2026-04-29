/**
 * Runtime OCPP connection settings (UI + .env). Mutable shared state.
 */

export const connectionConfig = {
  csmsUrl: (process.env.CSMS_WS_URL || '').trim(),
  chargePointId: (process.env.CHARGE_POINT_ID || '').trim(),
  password: (process.env.OCPP_PASSWORD || '').trim(),
};

/**
 * Build full WebSocket resource URL (path …/ocpp/{chargePointId}) from base + id.
 * Mirrors legacy: base ending with /{id} is left as-is; else base + '/' + id.
 * If base has no /ocpp segment, inserts /ocpp/{id} after origin (Volltra host-only base).
 */
export function normalizeResourceUrl(csmsBase, chargePointId) {
  const base = String(csmsBase || '').trim().replace(/\/$/, '');
  const cp = String(chargePointId || '').trim();
  if (!base || !cp) throw new Error('csmsUrl and chargePointId are required');

  const enc = encodeURIComponent(cp);
  if (base.endsWith(`/${cp}`) || base.endsWith(`/${enc}`)) {
    return base;
  }

  const lower = base.toLowerCase();
  if (lower.endsWith('/ocpp')) {
    return `${base}/${enc}`;
  }

  let u;
  try {
    u = new URL(base.includes('://') ? base : `wss://${base}`);
  } catch {
    throw new Error('Invalid csmsUrl');
  }

  const path = (u.pathname || '/').replace(/\/$/, '');
  if (path.toLowerCase().includes('/ocpp')) {
    return `${base}/${enc}`;
  }

  const port = u.port ? `:${u.port}` : '';
  return `${u.protocol}//${u.host}${port}/ocpp/${enc}`;
}

/**
 * OCPP 1.6J WebSocket URL. With password: userinfo chargePointId:password@host…/ocpp/…
 */
export function buildWebSocketUrl(config = connectionConfig) {
  const resourceUrl = normalizeResourceUrl(config.csmsUrl, config.chargePointId);
  const password = String(config.password || '').trim();
  if (!password) {
    return resourceUrl;
  }

  const u = new URL(resourceUrl);
  u.username = config.chargePointId.trim();
  u.password = password;
  return u.toString();
}

export function maskWebSocketUrlForLog(urlStr) {
  try {
    const u = new URL(urlStr);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return '[invalid url]';
  }
}

/** GET /config response (never includes password value). */
export function getPublicConnectionConfig() {
  return {
    csmsUrl: connectionConfig.csmsUrl,
    chargePointId: connectionConfig.chargePointId,
    passwordSet: Boolean(String(connectionConfig.password || '').trim()),
  };
}

/**
 * Parse Screen 5 style URL: wss://csms.volltra.com/ocpp/VOLLTRA-XXXXXXXX
 * @returns {{ csmsUrl: string, chargePointId: string }}
 */
export function parseVolltraWebSocketUrl(volltraUrl) {
  const raw = String(volltraUrl || '').trim();
  if (!raw) throw new Error('volltraUrl is required');

  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('Invalid WebSocket URL');
  }

  const path = u.pathname || '';
  const idx = path.toLowerCase().indexOf('/ocpp/');
  if (idx < 0) {
    throw new Error('URL must contain /ocpp/… (e.g. wss://csms.volltra.com/ocpp/VOLLTRA-XXXXXXXX)');
  }

  const after = path.slice(idx + '/ocpp/'.length).replace(/\/$/, '');
  if (!after) {
    throw new Error('Missing charge point id after /ocpp/');
  }

  const segments = after.split('/').filter(Boolean);
  const chargePointId = decodeURIComponent(segments[segments.length - 1]);
  if (!chargePointId) {
    throw new Error('Could not parse charge point id');
  }

  // Base URL is everything before /ocpp/ (scheme + host + port only)
  const csmsUrl = `${u.protocol}//${u.host}${u.port ? `:${u.port}` : ''}`.replace(/\/$/, '');

  return { csmsUrl, chargePointId };
}
