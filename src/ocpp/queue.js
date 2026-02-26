import { v4 as uuidv4 } from 'uuid';
import { buildCall } from './message.js';

/**
 * Outgoing message queue with unique message IDs.
 * OCPP 1.6 allows only one outstanding CALL per direction (CP→CS).
 */
export class OutgoingQueue {
  constructor(sendFn) {
    this.sendFn = sendFn;
    this.queue = [];
    this.pending = null; // { messageId, action, payload, resolve, reject }
  }

  /**
   * Generate unique message ID.
   */
  nextMessageId() {
    return uuidv4().replace(/-/g, '').slice(0, 20);
  }

  /**
   * Enqueue a message. Sends immediately if no pending request.
   */
  enqueue(action, payload) {
    return new Promise((resolve, reject) => {
      const messageId = this.nextMessageId();
      const item = { messageId, action, payload, resolve, reject };
      if (!this.pending) {
        this._send(item);
      } else {
        this.queue.push(item);
      }
    });
  }

  _send(item) {
    this.pending = item;
    const frame = buildCall(item.messageId, item.action, item.payload);
    this.sendFn(frame);
  }

  /**
   * Handle CALLRESULT for our pending request.
   */
  handleResult(messageId, payload) {
    if (!this.pending || this.pending.messageId !== messageId) {
      return false;
    }
    const { resolve } = this.pending;
    this.pending = null;
    resolve(payload);
    this._drain();
    return true;
  }

  /**
   * Handle CALLERROR for our pending request.
   */
  handleError(messageId, errorCode, errorDescription, errorDetails) {
    if (!this.pending || this.pending.messageId !== messageId) {
      return false;
    }
    const { reject } = this.pending;
    const err = new Error(`${errorCode}: ${errorDescription}`);
    err.code = errorCode;
    err.details = errorDetails;
    this.pending = null;
    reject(err);
    this._drain();
    return true;
  }

  _drain() {
    if (this.pending || this.queue.length === 0) return;
    const item = this.queue.shift();
    this._send(item);
  }
}
