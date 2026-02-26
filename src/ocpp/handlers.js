/**
 * Handlers for CSMS-initiated OCPP 1.6 messages.
 * Each handler receives (payload, state) and returns response payload or throws.
 */
import { ConnectorStatus, ChargePointErrorCode } from './chargepoint.js';

export const CSMS_ACTIONS = [
  'RemoteStartTransaction',
  'RemoteStopTransaction',
  'ChangeAvailability',
  'Reset',
  'GetConfiguration',
  'ChangeConfiguration',
  'UnlockConnector',
];

/**
 * RemoteStartTransaction - CS requests CP to start a transaction.
 * Payload: { idTag?, connectorId? }
 * Response: { status: Accepted | Rejected }
 */
export function handleRemoteStartTransaction(payload, state) {
  const { idTag, connectorId } = payload ?? {};
  const connector = connectorId ?? 1;
  const status = state.getConnectorStatus(connector);

  if (status !== ConnectorStatus.Available && status !== ConnectorStatus.Preparing) {
    return { status: 'Rejected' };
  }
  if (state.getTransaction(connector)) {
    return { status: 'Rejected' };
  }

  state.setRemoteStartRequested(connector, idTag ?? 'REMOTE');
  return { status: 'Accepted' };
}

/**
 * RemoteStopTransaction - CS requests CP to stop a transaction.
 * Payload: { transactionId }
 * Response: { status: Accepted | Rejected }
 */
export function handleRemoteStopTransaction(payload, state) {
  const { transactionId } = payload ?? {};
  const tx = state.getTransactionByTransactionId(transactionId);
  if (!tx) {
    return { status: 'Rejected' };
  }
  state.setRemoteStopRequested(tx.transactionId);
  return { status: 'Accepted' };
}

/**
 * ChangeAvailability - CS sets connector to Operative or Inoperative.
 * Payload: { connectorId, type: Operative | Inoperative }
 * Response: { status: Accepted | Rejected | Scheduled }
 */
export function handleChangeAvailability(payload, state) {
  const { connectorId, type } = payload ?? {};
  if (connectorId == null || !['Operative', 'Inoperative'].includes(type)) {
    throw new Error('Invalid ChangeAvailability payload');
  }
  const newStatus = type === 'Operative' ? ConnectorStatus.Available : ConnectorStatus.Unavailable;
  const config = state.getConfiguration();
  const numConnectors = parseInt(config.NumberOfConnectors ?? '2', 10) || 2;
  const ids = connectorId === 0 ? [...Array(numConnectors).keys()].map((i) => i + 1) : [connectorId];
  for (const id of ids) {
    state.setAvailability(id, newStatus);
    state.notifyStatusChange?.(id, newStatus);
  }
  return { status: 'Accepted' };
}

/**
 * Reset - CS requests CP to reboot.
 * Payload: { type: Hard | Soft }
 * Response: { status: Accepted | Rejected }
 */
export function handleReset(payload, state) {
  const { type } = payload ?? {};
  if (!['Hard', 'Soft'].includes(type)) {
    throw new Error('Invalid Reset payload');
  }
  state.setResetRequested(type);
  return { status: 'Accepted' };
}

/**
 * GetConfiguration - CS reads configuration keys.
 * Payload: { key?: string[] } - empty or omitted = all keys
 * Response: { configurationKey: [{ key, readonly, value? }], unknownKey?: string[] }
 */
export function handleGetConfiguration(payload, state) {
  const { key: requestedKeys } = payload ?? {};
  const config = state.getConfiguration();
  const keys = requestedKeys && requestedKeys.length > 0 ? requestedKeys : Object.keys(config);
  const configurationKey = [];
  const unknownKey = [];

  for (const k of keys) {
    const v = config[k];
    if (v === undefined) {
      unknownKey.push(k);
    } else {
      configurationKey.push({
        key: k,
        readonly: state.isConfigReadOnly(k),
        value: String(v),
      });
    }
  }
  return { configurationKey, ...(unknownKey.length > 0 && { unknownKey }) };
}

/**
 * ChangeConfiguration - CS writes a configuration key.
 * Payload: { key, value }
 * Response: { status: Accepted | Rejected | RebootRequired | NotSupported }
 */
export function handleChangeConfiguration(payload, state) {
  const { key, value } = payload ?? {};
  if (!key || value === undefined) {
    throw new Error('Invalid ChangeConfiguration payload');
  }
  const result = state.setConfiguration(key, String(value));
  return { status: result };
}

/**
 * UnlockConnector - CS requests CP to unlock a connector.
 * Payload: { connectorId }
 * Response: { status: Unlocked | UnlockFailed | NotSupported }
 */
export function handleUnlockConnector(payload, state) {
  const { connectorId } = payload ?? {};
  if (connectorId == null) {
    throw new Error('Invalid UnlockConnector payload');
  }
  state.setUnlockRequested(connectorId);
  return { status: 'Unlocked' };
}

const HANDLER_MAP = {
  RemoteStartTransaction: handleRemoteStartTransaction,
  RemoteStopTransaction: handleRemoteStopTransaction,
  ChangeAvailability: handleChangeAvailability,
  Reset: handleReset,
  GetConfiguration: handleGetConfiguration,
  ChangeConfiguration: handleChangeConfiguration,
  UnlockConnector: handleUnlockConnector,
};

export function getHandler(action) {
  return HANDLER_MAP[action];
}
