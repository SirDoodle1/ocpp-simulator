/**
 * OCPP 1.6J Charge Point Simulator with charging session state machine.
 * States: Idle → Preparing → Charging → Finishing → Idle
 */
import {
  bootNotificationPayload,
  heartbeatPayload,
  statusNotificationPayload,
  authorizePayload,
  startTransactionPayload,
  stopTransactionPayload,
  meterValuesPayload,
  buildSampledValues,
  ConnectorStatus,
  ChargePointErrorCode,
} from './ocpp/chargepoint.js';
import { getProfile } from './profiles.js';
import { buildCallResult, buildCallError } from './ocpp/message.js';
import { getHandler } from './ocpp/handlers.js';
import { SessionState, toOcppStatus, canTransition } from './session-state-machine.js';

const DEFAULT_HEARTBEAT_INTERVAL = 60;
const DEFAULT_METER_INTERVAL = 60;
const DEFAULT_CONNECTORS = 2;
const DEFAULT_CHARGING_SPEED_KW = 7.4;
const DEFAULT_MAX_SESSION_DURATION_SEC = 3600; // 1 hour

export class Simulator {
  constructor(queue, chargePointId, opts = {}) {
    this.queue = queue;
    this.chargePointId = chargePointId;
    this.log = opts.log ?? console.log;

    this.connectors = opts.connectors ?? DEFAULT_CONNECTORS;
    this.maxSessionDurationSec = opts.maxSessionDurationSec ?? DEFAULT_MAX_SESSION_DURATION_SEC;

    this.profile = this._resolveProfile(opts.profile ?? opts.chargerProfile ?? process.env.CHARGER_PROFILE);
    this.chargingSpeedKw = this.profile?.maxPowerKw ?? opts.chargingSpeedKw ?? DEFAULT_CHARGING_SPEED_KW;
    this.meterInterval = this.profile?.meterValueIntervalSec ?? opts.meterValueIntervalSec ?? DEFAULT_METER_INTERVAL;

    // Session state per connector: connectorId -> SessionState
    this.sessionState = new Map();
    for (let i = 1; i <= this.connectors; i++) {
      this.sessionState.set(i, SessionState.Idle);
    }

    // OCPP connector status (for getConnectorStatus) - derived from sessionState + availability
    this.connectorStatus = new Map();
    for (let i = 1; i <= this.connectors; i++) {
      this.connectorStatus.set(i, ConnectorStatus.Available);
    }
    this.availability = new Map();

    // Config store
    this.config = new Map([
      ['NumberOfConnectors', String(this.connectors)],
      ['HeartbeatInterval', String(DEFAULT_HEARTBEAT_INTERVAL)],
      ['MeterValueSampleInterval', String(this.meterInterval)],
      ['MeterValuesSampledData', (this.profile?.measurands ?? ['Energy.Active.Import.Register']).join(',')],
      ['SupportedFeatureProfiles', 'Core'],
      ['ChargePointModel', this.profile?.chargePointModel ?? 'OCPP-1.6J-Sim'],
      ['ChargePointVendor', 'RechargeSimulator'],
    ]);
    this.configReadOnly = new Set(['NumberOfConnectors', 'ChargePointModel', 'ChargePointVendor']);

    this.heartbeatInterval = DEFAULT_HEARTBEAT_INTERVAL;
    this.heartbeatTimer = null;
    this.meterTimer = null;

    // Active transactions: connectorId -> { transactionId, idTag, meterStart, meterWh, startedAt }
    this.transactions = new Map();

    this.remoteStartRequested = new Map();
    this.remoteStopRequested = null;
    this.resetRequested = null;
    this.unlockRequested = new Set();
    this.faultedConnectors = new Set();
    this.onEmit = opts.onEmit ?? null;
  }

  _resolveProfile(name) {
    if (!name) return null;
    const p = getProfile(name);
    if (p) this.log(`[Simulator] Profile: ${p.name} (${name})`);
    return p;
  }

  setProfile(profileName) {
    const p = getProfile(profileName);
    if (!p) return { ok: false, error: `Unknown profile: ${profileName}` };
    this.profile = p;
    this.chargingSpeedKw = p.maxPowerKw ?? this.chargingSpeedKw;
    this.meterInterval = p.meterValueIntervalSec ?? this.meterInterval;
    this.config.set('MeterValueSampleInterval', String(this.meterInterval));
    this.config.set('MeterValuesSampledData', (p.measurands ?? ['Energy.Active.Import.Register']).join(','));
    this.config.set('ChargePointModel', p.chargePointModel ?? this.config.get('ChargePointModel'));
    this.log(`[Simulator] Profile set: ${p.name} (${profileName}), ${this.chargingSpeedKw}kW, interval=${this.meterInterval}s`);
    return { ok: true, profile: p };
  }

  // --- State ---
  getSessionState(connectorId) {
    return this.sessionState.get(connectorId) ?? SessionState.Idle;
  }

  setSessionState(connectorId, state, { force = false } = {}) {
    const currentState = this.getSessionState(connectorId);
    if (!force && !canTransition(currentState, state)) {
      this.log(`[Simulator] Invalid OCPP state transition: ${currentState} → ${state} (connector ${connectorId})`);
      return false;
    }
    this.sessionState.set(connectorId, state);
    const ocppStatus = toOcppStatus(state);
    this.connectorStatus.set(connectorId, ocppStatus);
    this.queue.enqueue('StatusNotification', statusNotificationPayload(connectorId, ocppStatus)).catch((err) =>
      this.log(`[Simulator] StatusNotification failed:`, err.message)
    );
    return true;
  }

  getConnectorStatus(connectorId) {
    if (this.faultedConnectors.has(connectorId)) return ConnectorStatus.Faulted;
    const avail = this.availability.get(connectorId);
    if (avail) return avail;
    return this.connectorStatus.get(connectorId) ?? ConnectorStatus.Unavailable;
  }

  getTransaction(connectorId) {
    return this.transactions.get(connectorId) ?? null;
  }

  getTransactionByTransactionId(transactionId) {
    for (const tx of this.transactions.values()) {
      if (tx.transactionId === transactionId) return tx;
    }
    return null;
  }

  getConfiguration() {
    return Object.fromEntries(this.config);
  }

  isConfigReadOnly(key) {
    return this.configReadOnly.has(key);
  }

  setAvailability(connectorId, status) {
    this.availability.set(connectorId, status);
  }

  notifyStatusChange(connectorId, status) {
    this.queue.enqueue('StatusNotification', statusNotificationPayload(connectorId, status)).catch((err) =>
      this.log(`[Simulator] StatusNotification failed:`, err.message)
    );
  }

  setRemoteStartRequested(connectorId, idTag) {
    this.remoteStartRequested.set(connectorId, idTag);
  }

  setRemoteStopRequested(transactionId) {
    this.remoteStopRequested = transactionId;
  }

  setResetRequested(type) {
    this.resetRequested = type;
  }

  setUnlockRequested(connectorId) {
    this.unlockRequested.add(connectorId);
  }

  setConfiguration(key, value) {
    if (this.configReadOnly.has(key)) return 'Rejected';
    if (['HeartbeatInterval', 'heartbeatInterval'].includes(key)) {
      this.heartbeatInterval = parseInt(value, 10) || DEFAULT_HEARTBEAT_INTERVAL;
    }
    if (['MeterValueSampleInterval', 'MeterValuesSampleInterval'].includes(key)) {
      this.meterInterval = parseInt(value, 10) || DEFAULT_METER_INTERVAL;
    }
    this.config.set(key, value);
    return 'Accepted';
  }

  // --- Energy calculation: Wh = kW * 1000 * (seconds / 3600) ---
  whPerInterval() {
    return Math.round((this.chargingSpeedKw * 1000 * this.meterInterval) / 3600);
  }

  // --- Boot, Heartbeat, Status ---
  async sendBootNotification(overrides = {}) {
    const model = overrides.chargePointModel ?? this.profile?.chargePointModel;
    const payload = bootNotificationPayload({ ...(model && { chargePointModel: model }), ...overrides });
    const res = await this.queue.enqueue('BootNotification', payload);
    const { status, interval, currentTime } = res;
    this.heartbeatInterval = interval ?? DEFAULT_HEARTBEAT_INTERVAL;
    if (status === 'Rejected') {
      this.log(`[Simulator] BootNotification rejected, retry in ${this.heartbeatInterval}s`);
      return { status, retryIn: this.heartbeatInterval };
    }
    if (status === 'Pending') {
      this.log(`[Simulator] BootNotification pending, retry in ${this.heartbeatInterval}s`);
      return { status, retryIn: this.heartbeatInterval };
    }
    this.log(`[Simulator] BootNotification accepted, heartbeat=${this.heartbeatInterval}s, charging=${this.chargingSpeedKw}kW`);
    this.startHeartbeat();
    this.sendStatusNotifications();
    return { status: 'Accepted', interval: this.heartbeatInterval, currentTime };
  }

  sendStatusNotifications() {
    for (let i = 1; i <= this.connectors; i++) {
      const status = this.availability.get(i) ?? this.connectorStatus.get(i) ?? ConnectorStatus.Available;
      this.queue.enqueue('StatusNotification', statusNotificationPayload(i, status));
    }
  }

  startHeartbeat() {
    this.stopHeartbeat();
    const send = () => {
      this.queue.enqueue('Heartbeat', heartbeatPayload()).catch((err) =>
        this.log(`[Simulator] Heartbeat failed:`, err.message)
      );
    };
    this.heartbeatTimer = setInterval(send, this.heartbeatInterval * 1000);
    send();
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  stopMeterValues() {
    if (this.meterTimer) {
      clearInterval(this.meterTimer);
      this.meterTimer = null;
    }
  }

  // --- Session flow: Authorize → StartTransaction ---
  async sendAuthorize(idTag) {
    return this.queue.enqueue('Authorize', authorizePayload(idTag));
  }

  async sendStartTransaction(connectorId, idTag, meterStart = 0) {
    const payload = startTransactionPayload(connectorId, idTag, meterStart);
    const res = await this.queue.enqueue('StartTransaction', payload);
    const { transactionId } = res;
    this.transactions.set(connectorId, {
      transactionId,
      idTag,
      meterStart,
      meterWh: meterStart,
      startedAt: new Date(),
    });
    this.startMeterValuesIfNeeded();
    return res;
  }

  async sendStopTransaction(connectorId, transactionId, meterStop, reason = 'Local', idTag) {
    const tx = this.transactions.get(connectorId);
    const payload = stopTransactionPayload(
      transactionId,
      meterStop,
      new Date(),
      reason,
      idTag ?? tx?.idTag
    );
    const res = await this.queue.enqueue('StopTransaction', payload);
    this.transactions.delete(connectorId);
    this.stopMeterValuesIfNeeded();
    return res;
  }

  startMeterValuesIfNeeded() {
    if (this.meterTimer) return;
    const active = [...this.transactions.keys()];
    if (active.length === 0) return;

    const intervalMs = this.meterInterval * 1000;
    const whPerTick = this.whPerInterval();

    this.meterTimer = setInterval(() => {
      const connectorIds = [...this.transactions.keys()];
      for (const connectorId of connectorIds) {
        const tx = this.transactions.get(connectorId);
        if (!tx) continue;

        const elapsedSec = (Date.now() - tx.startedAt.getTime()) / 1000;
        if (this.maxSessionDurationSec > 0 && elapsedSec >= this.maxSessionDurationSec) {
          this.log(`[Simulator] Connector ${connectorId} max session duration reached, stopping`);
          this.stopSession(connectorId, 'Other').catch((e) => this.log('[Simulator] Auto-stop error:', e.message));
          continue;
        }

        tx.meterWh += whPerTick;
        const measurands = this.profile?.measurands ?? ['Energy.Active.Import.Register'];
        const elapsedMin = elapsedSec / 60;
        const powerTaper = this.profile?.quirks?.includes('power_taper')
          ? Math.max(0.5, 1 - elapsedMin * 0.01)
          : 1;
        const powerW = Math.round((this.chargingSpeedKw * 1000) * powerTaper);
        const temp = this.profile?.quirks?.includes('temperature_reporting')
          ? Math.min(50, 25 + elapsedMin * 0.5)
          : undefined;
        const sampledValue = buildSampledValues(
          {
            meterWh: tx.meterWh,
            powerW,
            voltage: this.profile?.voltage ?? 230,
            amperage: this.profile?.amperage ?? 32,
            temperature: temp,
          },
          measurands
        );
        const payload = meterValuesPayload(connectorId, tx.transactionId, [
          { timestamp: new Date(), sampledValue },
        ]);
        this.queue.enqueue('MeterValues', payload).catch((err) =>
          this.log(`[Simulator] MeterValues failed:`, err.message)
        );
        this.onEmit?.('meter_update', { connectorId, transactionId: tx.transactionId, meterWh: tx.meterWh, powerW });
      }
    }, intervalMs);
  }

  stopMeterValuesIfNeeded() {
    if (this.transactions.size > 0) return;
    if (this.meterTimer) {
      clearInterval(this.meterTimer);
      this.meterTimer = null;
    }
  }

  // --- Manual session control ---
  /**
   * Start a session (RFID flow): Authorize → Preparing → StartTransaction → Charging
   * Returns { ok, error?, transactionId? }
   */
  async startSession(connectorId, idTag = 'SIM-RFID') {
    const state = this.getSessionState(connectorId);
    if (state !== SessionState.Idle && state !== SessionState.Preparing) {
      return { ok: false, error: `Connector ${connectorId} not idle or preparing (${state})` };
    }

    try {
      const authRes = await this.sendAuthorize(idTag);
      const status = authRes?.idTagInfo?.status ?? authRes?.status;
      if (status !== 'Accepted' && status !== 'ConcurrentTx') {
        return { ok: false, error: `Authorize rejected: ${status}` };
      }

      return this._doStartTransaction(connectorId, idTag);
    } catch (err) {
      this.setSessionState(connectorId, SessionState.Idle, { force: true });
      return { ok: false, error: err.message };
    }
  }

  /**
   * Start session without Authorize (for RemoteStartTransaction).
   */
  async startSessionRemote(connectorId, idTag = 'REMOTE') {
    if (this.getSessionState(connectorId) !== SessionState.Idle) {
      return { ok: false, error: `Connector ${connectorId} not idle` };
    }
    try {
      return this._doStartTransaction(connectorId, idTag);
    } catch (err) {
      this.setSessionState(connectorId, SessionState.Idle, { force: true });
      return { ok: false, error: err.message };
    }
  }

  async _doStartTransaction(connectorId, idTag) {
    this.setSessionState(connectorId, SessionState.Preparing);
    await new Promise((r) => setTimeout(r, 300));

    this.setSessionState(connectorId, SessionState.Charging);
    const startRes = await this.sendStartTransaction(connectorId, idTag, 0);
    this.log(`[Simulator] Session started: connector=${connectorId}, transactionId=${startRes.transactionId}, idTag=${idTag}`);
    return { ok: true, transactionId: startRes.transactionId };
  }

  /**
   * Stop a session: Finishing → StopTransaction → Idle
   */
  async stopSession(connectorId, reason = 'Local') {
    const tx = this.transactions.get(connectorId);
    if (!tx) {
      return { ok: false, error: `No active session on connector ${connectorId}` };
    }

    try {
      this.setSessionState(connectorId, SessionState.Finishing);
      await new Promise((r) => setTimeout(r, 200));

      const meterStop = tx.meterWh;
      await this.sendStopTransaction(connectorId, tx.transactionId, meterStop, reason, tx.idTag);
      this.setSessionState(connectorId, SessionState.Idle);
      this.log(`[Simulator] Session stopped: connector=${connectorId}, transactionId=${tx.transactionId}, reason=${reason}, energy=${meterStop}Wh`);
      return { ok: true };
    } catch (err) {
      this.setSessionState(connectorId, SessionState.Idle, { force: true });
      this.transactions.delete(connectorId);
      return { ok: false, error: err.message };
    }
  }

  /** Stop by transactionId */
  async stopSessionByTransactionId(transactionId, reason = 'Local') {
    for (const [connectorId, tx] of this.transactions) {
      if (tx.transactionId === transactionId) {
        return this.stopSession(connectorId, reason);
      }
    }
    return { ok: false, error: `Transaction ${transactionId} not found` };
  }

  getStatus() {
    const connectors = [];
    for (let i = 1; i <= this.connectors; i++) {
      const state = this.getSessionState(i);
      const tx = this.transactions.get(i);
      const ocppStatus = this.getConnectorStatus(i);
      connectors.push({
        connectorId: i,
        state,
        ocppStatus,
        faulted: this.faultedConnectors.has(i),
        transactionId: tx?.transactionId ?? null,
        meterWh: tx?.meterWh ?? 0,
        idTag: tx?.idTag ?? null,
        startedAt: tx?.startedAt?.toISOString?.() ?? null,
      });
    }
    return {
      connectors,
      chargePointId: this.chargePointId,
      profile: this.profile ? { id: this.profile.id, name: this.profile.name, maxPowerKw: this.profile.maxPowerKw, connectorType: this.profile.connectorType } : null,
    };
  }

  // --- Plug / Fault / Available (HTTP control API) ---
  plugIn(connectorId = 1) {
    if (this.faultedConnectors.has(connectorId)) return { ok: false, error: 'Connector is faulted' };
    const state = this.getSessionState(connectorId);
    if (state !== SessionState.Idle) return { ok: false, error: `Connector ${connectorId} not idle (${state})` };
    this.setSessionState(connectorId, SessionState.Preparing);
    this.log(`[Simulator] Connector ${connectorId} plugged in → Preparing`);
    return { ok: true };
  }

  plugOut(connectorId = 1) {
    const state = this.getSessionState(connectorId);
    const tx = this.transactions.get(connectorId);
    if (state === SessionState.Charging && tx) {
      return this.stopSession(connectorId, 'EVDisconnected');
    }
    if (state === SessionState.Preparing) {
      this.setSessionState(connectorId, SessionState.Idle);
      this.log(`[Simulator] Connector ${connectorId} unplugged (no session) → Idle`);
      return { ok: true };
    }
    if (state === SessionState.Idle) return { ok: true };
    return { ok: false, error: `Connector ${connectorId} in ${state}, cannot plug out` };
  }

  setFault(connectorId = 1, errorCode = ChargePointErrorCode.OtherError) {
    const tx = this.transactions.get(connectorId);
    if (tx) return { ok: false, error: 'Stop session before faulting' };
    this.faultedConnectors.add(connectorId);
    this.connectorStatus.set(connectorId, ConnectorStatus.Faulted);
    this.queue.enqueue('StatusNotification', statusNotificationPayload(connectorId, ConnectorStatus.Faulted, errorCode)).catch((err) =>
      this.log(`[Simulator] StatusNotification failed:`, err.message)
    );
    this.log(`[Simulator] Connector ${connectorId} faulted`);
    return { ok: true };
  }

  setAvailable(connectorId) {
    const ids = connectorId != null ? [connectorId] : [...Array(this.connectors).keys()].map((i) => i + 1);
    for (const id of ids) {
      if (this.transactions.has(id)) continue;
      this.faultedConnectors.delete(id);
      this.availability.delete(id);
      this.setSessionState(id, SessionState.Idle, { force: true });
      this.log(`[Simulator] Connector ${id} set available`);
    }
    return { ok: true };
  }

  // --- Handle CSMS requests ---
  handleIncoming(messageId, action, payload) {
    const handler = getHandler(action);
    if (!handler) {
      return buildCallError(messageId, 'NotImplemented', `Action ${action} not implemented`, {});
    }
    try {
      const responsePayload = handler(payload, this);
      return buildCallResult(messageId, responsePayload);
    } catch (err) {
      return buildCallError(
        messageId,
        'InternalError',
        err.message ?? 'Internal error',
        {}
      );
    }
  }

  async processPendingActions() {
    // RemoteStartTransaction
    for (const [connectorId, idTag] of this.remoteStartRequested) {
      this.remoteStartRequested.delete(connectorId);
      if (this.getSessionState(connectorId) !== SessionState.Idle) continue;
      try {
        await this.startSessionRemote(connectorId, idTag ?? 'REMOTE');
      } catch (err) {
        this.log(`[Simulator] RemoteStart failed:`, err.message);
      }
    }

    // RemoteStopTransaction
    if (this.remoteStopRequested) {
      const txId = this.remoteStopRequested;
      this.remoteStopRequested = null;
      const res = await this.stopSessionByTransactionId(txId, 'Remote');
      if (!res.ok) this.log(`[Simulator] RemoteStop failed:`, res.error);
    }

    if (this.resetRequested) {
      this.stop();
      this.log(`[Simulator] Reset (${this.resetRequested}) requested - connection will close`);
    }
  }

  isResetRequested() {
    return this.resetRequested;
  }

  clearResetRequested() {
    this.resetRequested = null;
  }

  stop() {
    this.stopHeartbeat();
    this.stopMeterValues();
  }
}
