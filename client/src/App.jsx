import { useState, useEffect } from 'react';
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

function Header({ status, connected, profiles }) {
  return (
    <header className="flex items-center justify-between px-6 py-4 bg-slate-900/80 border-b border-slate-700">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-semibold text-white">OCPP Simulator</h1>
        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-700 text-slate-300">
          {status?.profile?.name || '—'} {status?.profile?.maxPowerKw ? `${status.profile.maxPowerKw}kW` : ''}
        </span>
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-sm text-slate-400">{connected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => api.connect()}
          disabled={connected}
          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium"
        >
          Connect
        </button>
        <button
          onClick={() => api.disconnect()}
          disabled={!connected}
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

function ActiveSessionPanel({ status, onStop }) {
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
        onClick={() => onStop(session.connectorId)}
        className="mt-4 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium"
      >
        Stop Session
      </button>
    </section>
  );
}

function ControlsPanel({ status, connectorId, setConnectorId, idTag, setIdTag, profiles }) {
  const hasSim = !!status?.connectors;

  return (
    <section className="bg-slate-800/60 rounded-xl p-5 border border-slate-700">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">Controls</h2>
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
          <button onClick={() => api.plugIn(connectorId)} disabled={!hasSim} className="px-3 py-2 rounded-lg bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-sm">Plug In</button>
          <button onClick={() => api.plugOut(connectorId)} disabled={!hasSim} className="px-3 py-2 rounded-lg bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-sm">Plug Out</button>
          <button onClick={() => api.startSession(connectorId, idTag || 'RFID')} disabled={!hasSim} className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-sm">Start Session</button>
          <button onClick={() => api.stopSession(connectorId)} disabled={!hasSim} className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-sm">Stop Session</button>
          <button onClick={() => api.setFault(connectorId)} disabled={!hasSim} className="px-3 py-2 rounded-lg bg-red-600/80 hover:bg-red-500 disabled:opacity-50 text-sm">Set Fault</button>
          <button onClick={() => api.setAvailable(connectorId)} disabled={!hasSim} className="px-3 py-2 rounded-lg bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-sm">Clear Fault</button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">Profile:</span>
          <select
            value={status?.profile?.id ?? ''}
            onChange={(e) => e.target.value && api.setProfile(e.target.value)}
            className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white"
          >
            <option value="">Select...</option>
            {(profiles ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.maxPowerKw}kW)</option>
            ))}
          </select>
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

  useEffect(() => {
    api.getProfiles().then((r) => r.profiles && setProfiles(r.profiles));
  }, []);

  const lastHeartbeat = status?.lastHeartbeatAt ?? null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <Header status={status} connected={connected} profiles={profiles} />
      <main className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="grid md:grid-cols-2 gap-6">
          <ChargerStatusPanel status={status} lastHeartbeat={lastHeartbeat} />
          <ActiveSessionPanel status={status} onStop={api.stopSession} />
        </div>
        <ControlsPanel status={status} connectorId={connectorId} setConnectorId={setConnectorId} idTag={idTag} setIdTag={setIdTag} profiles={profiles} />
        <OcppLogPanel ocppLog={ocppLog} logFilter={logFilter} setLogFilter={setLogFilter} clearLog={clearLog} />
      </main>
    </div>
  );
}
