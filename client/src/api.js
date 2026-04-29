const BASE = '';

export async function api(path, options = {}) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, ...data };
  } catch (err) {
    return { ok: false, error: err.message || 'Network error' };
  }
}

export async function getStatus() {
  return api('/status');
}
export async function getProfiles() {
  return api('/profiles');
}

export async function getConfig() {
  return api('/config');
}

export async function saveConfig(data) {
  return api('/config', { method: 'POST', body: JSON.stringify(data) });
}

export async function connectFromVolltra(data) {
  return api('/config/from-volltra', { method: 'POST', body: JSON.stringify(data) });
}

export async function connect() {
  return api('/connect', { method: 'POST', body: '{}' });
}
export async function disconnect() {
  return api('/disconnect', { method: 'POST', body: '{}' });
}
export async function plugIn(connectorId = 1) {
  return api('/plug-in', { method: 'POST', body: JSON.stringify({ connectorId }) });
}
export async function plugOut(connectorId = 1) {
  return api('/plug-out', { method: 'POST', body: JSON.stringify({ connectorId }) });
}
export async function startSession(connectorId = 1, idTag = 'RFID') {
  return api('/start-session', { method: 'POST', body: JSON.stringify({ connectorId, idTag }) });
}
export async function stopSession(connectorId) {
  return api('/stop-session', { method: 'POST', body: JSON.stringify({ connectorId }) });
}
export async function setFault(connectorId = 1) {
  return api('/fault', { method: 'POST', body: JSON.stringify({ connectorId }) });
}
export async function setAvailable(connectorId) {
  return api('/available', { method: 'POST', body: JSON.stringify({ connectorId }) });
}
export async function setProfile(profileName) {
  return api(`/set-profile/${profileName}`, { method: 'POST', body: '{}' });
}
