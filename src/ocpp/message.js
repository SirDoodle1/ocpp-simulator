/**
 * OCPP 1.6J message format.
 * MessageTypeId: 2=Call, 3=CallResult, 4=CallError
 */
export const MessageType = {
  CALL: 2,
  CALLRESULT: 3,
  CALLERROR: 4,
};

/**
 * Parse raw OCPP message.
 * @returns {{ type: number, messageId: string, action?: string, payload?: object, errorCode?: string, errorDescription?: string }}
 */
export function parseMessage(raw) {
  let arr;
  try {
    arr = JSON.parse(typeof raw === 'string' ? raw : raw.toString());
  } catch (e) {
    throw new Error(`Invalid JSON: ${e.message}`);
  }
  if (!Array.isArray(arr) || arr.length < 2) {
    throw new Error('Invalid OCPP message: expected array with at least 2 elements');
  }
  const [type, messageId, ...rest] = arr;
  if (type === MessageType.CALL) {
    const [action, payload] = rest;
    return { type, messageId, action, payload: payload ?? {} };
  }
  if (type === MessageType.CALLRESULT) {
    const [payload] = rest;
    return { type, messageId, payload: payload ?? {} };
  }
  if (type === MessageType.CALLERROR) {
    const [errorCode, errorDescription, errorDetails] = rest;
    return { type, messageId, errorCode, errorDescription, errorDetails };
  }
  throw new Error(`Unknown message type: ${type}`);
}

/**
 * Build CALL message.
 */
export function buildCall(messageId, action, payload = {}) {
  return JSON.stringify([MessageType.CALL, messageId, action, payload]);
}

/**
 * Build CALLRESULT message.
 */
export function buildCallResult(messageId, payload = {}) {
  return JSON.stringify([MessageType.CALLRESULT, messageId, payload]);
}

/**
 * Build CALLERROR message.
 */
export function buildCallError(messageId, errorCode, errorDescription, errorDetails = {}) {
  return JSON.stringify([MessageType.CALLERROR, messageId, errorCode, errorDescription, errorDetails]);
}
