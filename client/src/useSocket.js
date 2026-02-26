import { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';

export function useSocket() {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState(null);
  const [ocppLog, setOcppLog] = useState([]);
  const [logFilter, setLogFilter] = useState('all');

  useEffect(() => {
    fetch('/status')
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ connected: false }));

    const s = io({ path: '/socket.io' });
    setSocket(s);

    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));

    s.on('connection_state', (data) => {
      setStatus((prev) => (prev ? { ...prev, connected: data.connected } : { connected: data.connected }));
    });
    s.on('session_update', (data) => setStatus((prev) => ({ ...prev, ...data })));
    s.on('meter_update', (data) => {
      setStatus((prev) => {
        if (!prev?.connectors) return prev;
        const connectors = prev.connectors.map((c) =>
          c.connectorId === data.connectorId && c.transactionId === data.transactionId
            ? { ...c, meterWh: data.meterWh, powerW: data.powerW }
            : c
        );
        return { ...prev, connectors };
      });
    });
    s.on('ocpp_message', (data) => {
      setOcppLog((prev) => [data, ...prev].slice(0, 500));
    });

    return () => s.disconnect();
  }, []);

  const clearLog = useCallback(() => setOcppLog([]), []);

  const filteredLog = logFilter === 'all' ? ocppLog : ocppLog.filter((e) => e.action === logFilter || (logFilter === 'error' && e.raw?.includes('CALLERROR')));

  return { socket, connected, status, ocppLog: filteredLog, setLogFilter, logFilter, clearLog };
}
