import { useState, useEffect, useCallback } from 'react';
import { useSocket } from './useSocket';
import * as api from './api';

function ChargerIcon({ status }) {
  const color = status === 'Charging' ? 'text-emerald-400' : status === 'Preparing' ? 'text-amber-400' : status === 'Faulted' ? 'text-red-500' : 'text-slate-500';
  return (
    <div className={`text-6xl ${color} transition-colors`}>
      {status === 'Charging' && '⚡'}
      {status === 'Preparing' && '🔌'}
      {status === 'Faulted' && '⚠️'}
      {(status === 'Available' || status === 'Idle') && '▫️'}
      {status === 'Finishing' && '✓'}
    </div>
  );
}

function Header({ status, connected, onError, settingsOpen, onToggleSettings }) {
  const csmsConnected = status?.connected ?? false;
  const handleConnect = async () => {
    onError?.(null);
    const res = await api.connect();
    if (!res.ok) onError?.(res.error || res.message || 'Connect failed');
  };
  const handleDisconnect = async () => {
    const res = await api.disconnect();
    if (!res.ok) onError?.(res.error || res.message || 'Disconnect failed');
  };
  return (
    <header className="flex items-center justify-between px-6 py-4 bg-slate-900/80 border-b border-slate-700">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-semibold text-white">OCPP Simulator</h1>
        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-700 text-slate-300">
          {status?.profile?.name || '—'} {status?.profile?.maxPowerKw ? `${status.profile.maxPowerKw}kW` : ''}
        </span>
        <div className="flex items-center gap-2" title={connected ? 'Receiving live updates' : 'No live updates from simulator'}>
          <span className={`w-2.5 h-2.5 rounded-full ${csmsConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-sm text-slate-400">{csmsConnected ? 'Connected to CSMS' : 'Disconnected'}</span>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onToggleSettings}
          aria-expanded={settingsOpen}
          className={`px-4 py-2 rounded-lg border text-sm font-medium ${
            settingsOpen ? 'bg-slate-600 border-slate-500 text-white' : 'bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700'
          }`}
        >
          ⚙️ Settings
        </button>
        <button
          type="button"
          onClick={handleConnect}
          disabled={csmsConnected}
          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium"
        >
          Connect
        </button>
        <button
          type="button"
          onClick={handleDisconnect}
          disabled={!csmsConnected}
          className="px-4 py-2 rounded-lg bg-red-600/80 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium"
        >
          Disconnect
        </button>
      </div>
    </header>
  );
}

function ChargerStatusPanel({ status, lastHeartbeat }) {
  const connectors = status?.connectors ?? [];
  const primary = connectors[0];
  const state = primary?.ocppStatus || primary?.state || '—';

  return (
    <section className="bg-slate-800/60 rounded-xl p-5 border border-slate-700">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">Charger Status</h2>
      <div className="flex items-center gap-6">
        <ChargerIcon status={state} />
        <div>
          <div className="text-2xl font-bold text-white">{state}</div>
          <div className="text-sm text-slate-400 mt-1">Last heartbeat: {lastHeartbeat || '—'}</div>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {connectors.map((c) => (
          <div
            key={c.connectorId}
            className={`flex justify-between items-center p-3 rounded-lg border ${
              c.ocppStatus === 'Charging' ? 'bg-emerald-900/30 border-emerald-600/50' :
              c.ocppStatus === 'Faulted' ? 'bg-red-900/20 border-red-600/50' :
              'bg-slate-800/50 border-slate-600'
            }`}
          >
            <span className="font-medium text-slate-200">Connector {c.connectorId}</span>
            <span className="text-sm text-slate-400">{c.ocppStatus || c.state} {c.faulted && '(Faulted)'}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ActiveSessionPanel({ status, onStop, onError }) {
  const connectors = status?.connectors ?? [];
  const session = connectors.find((c) => c.transactionId);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!session?.startedAt) return;
    const start = new Date(session.startedAt).getTime();
    const tick = () => setDuration(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session?.startedAt]);

  if (!session) return null;

  const meterKwh = (session.meterWh ?? 0) / 1000;
  const powerKw = (session.powerW ?? 0) / 1000;

  return (
    <section className="bg-slate-800/60 rounded-xl p-5 border border-slate-700">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">Active Session</h2>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-slate-500">Transaction ID</div>
          <div className="font-mono text-white">{session.transactionId}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">RFID / ID Tag</div>
          <div className="font-mono text-white">{session.idTag || '—'}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Energy Delivered</div>
          <div className="text-xl font-bold text-emerald-400">{meterKwh.toFixed(2)} kWh</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Duration</div>
          <div className="text-xl font-bold text-white">{Math.floor(duration / 60)}:{String(duration % 60).padStart(2, '0')}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Current Power</div>
          <div className="text-xl font-bold text-amber-400">{powerKw.toFixed(1)} kW</div>
        </div>
      </div>
      <button
        onClick={async () => {
          const res = await onStop(session.connectorId);
          if (res && !res.ok) onError?.(res?.error || res?.message || 'Stop failed');
        }}
        className="mt-4 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium"
      >
        Stop Session
      </button>
    </section>
  );
}

function ControlsPanel({ status, connectorId, setConnectorId, idTag, setIdTag, onError }) {
  const hasSim = !!status?.connectors;

  const withErrorCheck = (fn) => async (...args) => {
    const res = await fn(...args);
    if (!res?.ok) onError?.(res?.error || res?.message || 'Action failed');
    return res;
  };

  return (
    <section className="bg-slate-800/60 rounded-xl p-5 border border-slate-700">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">Controls</h2>
      {!hasSim && (
        <p className="mb-4 text-sm text-amber-400/90 bg-amber-900/20 rounded-lg px-3 py-2 border border-amber-600/30">
          Click <strong>Connect</strong> in the header to connect to the CSMS first. Configure the WebSocket URL and credentials under <strong>Settings</strong>, or set <code className="text-amber-300">CSMS_WS_URL</code> / <code className="text-amber-300">CHARGE_POINT_ID</code> in <code className="text-amber-300">.env</code>.
        </p>
      )}
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-slate-400 self-center">Connector:</span>
          <select
            value={connectorId}
            onChange={(e) => setConnectorId(Number(e.target.value))}
            className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white"
          >
            {(status?.connectors ?? [{ connectorId: 1 }]).map((c) => (
              <option key={c.connectorId} value={c.connectorId}>{c.connectorId}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm text-slate-400">RFID:</span>
          <input
            type="text"
            value={idTag}
            onChange={(e) => setIdTag(e.target.value)}
            placeholder="RFID-001"
            className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white w-32"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => withErrorCheck(api.plugIn)(connectorId)} disabled={!hasSim} className="px-3 py-2 rounded-lg bg-slate-600 hover:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm" title={!hasSim ? 'Connect to CSMS first' : undefined}>Plug In</button>
          <button type="button" onClick={() => withErrorCheck(api.plugOut)(connectorId)} disabled={!hasSim} className="px-3 py-2 rounded-lg bg-slate-600 hover:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm" title={!hasSim ? 'Connect to CSMS first' : undefined}>Plug Out</button>
          <button type="button" onClick={() => withErrorCheck(api.startSession)(connectorId, idTag || 'RFID')} disabled={!hasSim} className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm" title={!hasSim ? 'Connect to CSMS first' : undefined}>Start Session</button>
          <button type="button" onClick={() => withErrorCheck(api.stopSession)(connectorId)} disabled={!hasSim} className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm" title={!hasSim ? 'Connect to CSMS first' : undefined}>Stop Session</button>
          <button type="button" onClick={() => withErrorCheck(api.setFault)(connectorId)} disabled={!hasSim} className="px-3 py-2 rounded-lg bg-red-600/80 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm" title={!hasSim ? 'Connect to CSMS first' : undefined}>Set Fault</button>
          <button type="button" onClick={() => withErrorCheck(api.setAvailable)(connectorId)} disabled={!hasSim} className="px-3 py-2 rounded-lg bg-slate-600 hover:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm" title={!hasSim ? 'Connect to CSMS first' : undefined}>Clear Fault</button>
        </div>
      </div>
    </section>
  );
}

function SettingsPanel({ profiles, status, serverConfig, onReloadConfig, onError }) {
  const hasSim = !!status?.connectors;
  const [volltraUrl, setVolltraUrl] = useState('');
  const [volltraPassword, setVolltraPassword] = useState('');
  const [volltraMsg, setVolltraMsg] = useState('');
  const [volltraErr, setVolltraErr] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCsms, setManualCsms] = useState('');
  const [manualCp, setManualCp] = useState('');
  const [manualPw, setManualPw] = useState('');

  useEffect(() => {
    setManualCsms(serverConfig.csmsUrl || '');
    setManualCp(serverConfig.chargePointId || '');
  }, [serverConfig.csmsUrl, serverConfig.chargePointId]);

  const activeLine =
    serverConfig.chargePointId && serverConfig.csmsUrl
      ? `Active: ${serverConfig.chargePointId} → ${serverConfig.csmsUrl}`
      : 'Active: not configured';

  const handleVolltraConnect = async () => {
    setVolltraErr('');
    setVolltraMsg('');
    onError?.(null);
    const r1 = await api.connectFromVolltra({ volltraUrl: volltraUrl.trim(), password: volltraPassword });
    if (!r1.ok) {
      setVolltraErr(r1.error || 'Configuration failed');
      return;
    }
    await onReloadConfig();
    const r2 = await api.connect();
    if (!r2.ok) {
      setVolltraErr(r2.error || r2.message || 'Connect failed');
      return;
    }
    setVolltraMsg(`Connected as ${r1.chargePointId || serverConfig.chargePointId}`);
  };

  const handleManualSaveConnect = async () => {
    onError?.(null);
    const r = await api.saveConfig({
      csmsUrl: manualCsms.trim(),
      chargePointId: manualCp.trim(),
      password: manualPw,
    });
    if (!r.ok) {
      onError?.(r.error || 'Save failed');
      return;
    }
    await onReloadConfig();
    const r2 = await api.connect();
    if (!r2.ok) onError?.(r2.error || r2.message || 'Connect failed');
  };

  return (
    <section className="bg-slate-800/60 rounded-xl p-5 border border-slate-700 mb-6">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">Connection settings</h2>
      <p className="text-sm text-slate-300 mb-1 font-medium">{activeLine}</p>
      <p className="text-sm text-slate-400 mb-6">
        Password:{' '}
        {serverConfig.passwordSet ? (
          <span className="text-emerald-400">Set ✓</span>
        ) : (
          <span className="text-amber-400/90">Not set</span>
        )}
      </p>

      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-semibold text-white mb-3">Quick connect from Volltra app</h3>
          <label className="block text-xs text-slate-400 mb-1">Paste the WebSocket URL from the Volltra app</label>
          <input
            type="text"
            value={volltraUrl}
            onChange={(e) => setVolltraUrl(e.target.value)}
            placeholder="wss://csms.volltra.com/ocpp/VOLLTRA-XXXXXXXX"
            className="w-full max-w-2xl bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white mb-3"
          />
          <label className="block text-xs text-slate-400 mb-1">Password</label>
          <input
            type="password"
            value={volltraPassword}
            onChange={(e) => setVolltraPassword(e.target.value)}
            className="w-full max-w-md bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white mb-3"
          />
          <div>
            <button
              type="button"
              onClick={handleVolltraConnect}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium"
            >
              Connect to this charger
            </button>
          </div>
          {volltraErr && <p className="mt-2 text-sm text-red-400">{volltraErr}</p>}
          {volltraMsg && <p className="mt-2 text-sm text-emerald-400">{volltraMsg}</p>}
        </div>

        <div>
          <button
            type="button"
            onClick={() => setManualOpen((o) => !o)}
            className="text-sm font-medium text-slate-300 hover:text-white flex items-center gap-2"
          >
            <span className="text-slate-500">{manualOpen ? '▼' : '▶'}</span>
            Manual configuration
          </button>
          {manualOpen && (
            <div className="mt-4 space-y-3 pl-2 border-l-2 border-slate-600">
              <div>
                <label className="block text-xs text-slate-400 mb-1">CSMS base URL</label>
                <input
                  type="text"
                  value={manualCsms}
                  onChange={(e) => setManualCsms(e.target.value)}
                  placeholder="wss://csms.volltra.com or wss://localhost:8081/ocpp"
                  className="w-full max-w-2xl bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Charge point ID</label>
                <input
                  type="text"
                  value={manualCp}
                  onChange={(e) => setManualCp(e.target.value)}
                  placeholder="VOLLTRA-XXXXXXXX"
                  className="w-full max-w-md bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Password</label>
                <input
                  type="password"
                  value={manualPw}
                  onChange={(e) => setManualPw(e.target.value)}
                  className="w-full max-w-md bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
                />
              </div>
              <button
                type="button"
                onClick={handleManualSaveConnect}
                className="px-4 py-2 rounded-lg bg-slate-600 hover:bg-slate-500 text-white text-sm font-medium"
              >
                Save &amp; Connect
              </button>
            </div>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-white mb-2">Charger type</h3>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-400">Profile:</span>
            <select
              value={status?.profile?.id ?? ''}
              onChange={async (e) => {
                const v = e.target.value;
                if (v) {
                  const res = await api.setProfile(v);
                  if (!res?.ok) onError?.(res?.error || res?.message || 'Set profile failed');
                }
              }}
              disabled={!hasSim}
              className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              <option value="">Select...</option>
              {(profiles ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.maxPowerKw}kW)</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </section>
  );
}

function OcppLogPanel({ ocppLog, logFilter, setLogFilter, clearLog }) {
  const actions = ['all', 'BootNotification', 'Heartbeat', 'StatusNotification', 'Authorize', 'StartTransaction', 'StopTransaction', 'MeterValues', 'RemoteStartTransaction', 'RemoteStopTransaction', 'error'];

  return (
    <section className="bg-slate-800/60 rounded-xl p-5 border border-slate-700">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">OCPP Message Log</h2>
        <div className="flex gap-2">
          <select
            value={logFilter}
            onChange={(e) => setLogFilter(e.target.value)}
            className="bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-xs text-white"
          >
            {actions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <button onClick={clearLog} className="px-2 py-1 rounded bg-slate-600 hover:bg-slate-500 text-xs">Clear</button>
        </div>
      </div>
      <div className="h-64 overflow-y-auto font-mono text-xs space-y-1 bg-slate-900/50 rounded-lg p-3">
        {ocppLog.length === 0 && <div className="text-slate-500">No messages</div>}
        {ocppLog.map((e, i) => (
          <LogEntry key={i} entry={e} />
        ))}
      </div>
    </section>
  );
}

function LogEntry({ entry }) {
  const [expanded, setExpanded] = useState(false);
  const isError = entry.raw?.includes('CALLERROR') || entry.direction === 'error';
  const isOut = entry.direction === 'sent';
  const color = isError ? 'text-red-400' : isOut ? 'text-blue-400' : 'text-emerald-400';

  return (
    <div className={`border-l-2 pl-2 ${isOut ? 'border-blue-500' : 'border-emerald-500'}`}>
      <button onClick={() => setExpanded(!expanded)} className="w-full text-left">
        <span className="text-slate-500">{entry.ts?.slice(11, 19)}</span>
        <span className={`mx-2 ${color}`}>{isOut ? '↑' : '↓'}</span>
        <span className="text-slate-300">{entry.action || (isError ? 'CALLERROR' : '—')}</span>
      </button>
      {expanded && (
        <pre className="mt-1 text-slate-500 break-all whitespace-pre-wrap">{entry.raw}</pre>
      )}
    </div>
  );
}

export default function App() {
  const { connected, status, ocppLog, setLogFilter, logFilter, clearLog } = useSocket();
  const [connectorId, setConnectorId] = useState(1);
  const [idTag, setIdTag] = useState('RFID-001');
  const [profiles, setProfiles] = useState([]);
  const [error, setError] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [serverConfig, setServerConfig] = useState({
    csmsUrl: '',
    chargePointId: '',
    passwordSet: false,
  });

  const loadServerConfig = useCallback(async () => {
    const r = await api.getConfig();
    if (!r.ok && r.error) return;
    setServerConfig({
      csmsUrl: r.csmsUrl ?? '',
      chargePointId: r.chargePointId ?? '',
      passwordSet: Boolean(r.passwordSet),
    });
  }, []);

  useEffect(() => {
    api.getProfiles().then((r) => r.profiles && setProfiles(r.profiles));
  }, []);

  useEffect(() => {
    loadServerConfig();
  }, [loadServerConfig]);

  const lastHeartbeat = status?.lastHeartbeatAt ?? null;
  const showError = (msg) => setError(msg == null ? null : msg);
  const clearError = () => setError(null);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <Header
        status={status}
        connected={connected}
        onError={showError}
        settingsOpen={settingsOpen}
        onToggleSettings={() => setSettingsOpen((v) => !v)}
      />
      {error && (
        <div className="mx-6 mt-4 flex items-center justify-between gap-4 rounded-lg bg-red-900/30 border border-red-600/50 px-4 py-3 text-red-200 text-sm">
          <span>{error}</span>
          <button type="button" onClick={clearError} className="shrink-0 px-2 py-1 rounded bg-red-600/50 hover:bg-red-600 text-red-100 text-xs font-medium">
            Dismiss
          </button>
        </div>
      )}
      {settingsOpen && (
        <div className="max-w-6xl mx-auto px-6 pt-4">
          <SettingsPanel
            profiles={profiles}
            status={status}
            serverConfig={serverConfig}
            onReloadConfig={loadServerConfig}
            onError={showError}
          />
        </div>
      )}
      <main className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="grid md:grid-cols-2 gap-6">
          <ChargerStatusPanel status={status} lastHeartbeat={lastHeartbeat} />
          <ActiveSessionPanel status={status} onStop={api.stopSession} onError={showError} />
        </div>
        <ControlsPanel status={status} connectorId={connectorId} setConnectorId={setConnectorId} idTag={idTag} setIdTag={setIdTag} onError={showError} />
        <OcppLogPanel ocppLog={ocppLog} logFilter={logFilter} setLogFilter={setLogFilter} clearLog={clearLog} />
      </main>
    </div>
  );
}
