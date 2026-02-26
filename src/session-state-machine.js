/**
 * Charging session state machine.
 * Idle → Preparing → Charging → Finishing → Idle
 */
import { ConnectorStatus } from './ocpp/chargepoint.js';

export const SessionState = {
  Idle: 'Idle',
  Preparing: 'Preparing',
  Charging: 'Charging',
  Finishing: 'Finishing',
};

/** OCPP connector status for each session state */
export const STATE_TO_OCPP_STATUS = {
  [SessionState.Idle]: ConnectorStatus.Available,
  [SessionState.Preparing]: ConnectorStatus.Preparing,
  [SessionState.Charging]: ConnectorStatus.Charging,
  [SessionState.Finishing]: ConnectorStatus.Finishing,
};

const VALID_TRANSITIONS = {
  [SessionState.Idle]: [SessionState.Preparing],
  [SessionState.Preparing]: [SessionState.Charging, SessionState.Idle],
  [SessionState.Charging]: [SessionState.Finishing],
  [SessionState.Finishing]: [SessionState.Idle],
};

export function canTransition(from, to) {
  const allowed = VALID_TRANSITIONS[from];
  return allowed && allowed.includes(to);
}

export function toOcppStatus(state) {
  return STATE_TO_OCPP_STATUS[state] ?? ConnectorStatus.Unavailable;
}
