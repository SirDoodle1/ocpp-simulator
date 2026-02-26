/**
 * Charge Point initiated OCPP 1.6 messages.
 */

export const ConnectorStatus = {
  Available: 'Available',
  Preparing: 'Preparing',
  Charging: 'Charging',
  SuspendedEV: 'SuspendedEV',
  SuspendedEVSE: 'SuspendedEVSE',
  Finishing: 'Finishing',
  Reserved: 'Reserved',
  Unavailable: 'Unavailable',
  Faulted: 'Faulted',
};

export const ChargePointErrorCode = {
  NoError: 'NoError',
  ConnectorLockFailure: 'ConnectorLockFailure',
  EVCommunicationError: 'EVCommunicationError',
  GroundFailure: 'GroundFailure',
  HighTemperature: 'HighTemperature',
  InternalError: 'InternalError',
  LocalListConflict: 'LocalListConflict',
  OtherError: 'OtherError',
  OverCurrentFailure: 'OverCurrentFailure',
  OverVoltage: 'OverVoltage',
  PowerMeterFailure: 'PowerMeterFailure',
  PowerSwitchFailure: 'PowerSwitchFailure',
  ReaderFailure: 'ReaderFailure',
  ResetFailure: 'ResetFailure',
  UnderVoltage: 'UnderVoltage',
  WeakSignal: 'WeakSignal',
};

const DEFAULT_BOOT_PAYLOAD = {
  chargePointVendor: 'RechargeSimulator',
  chargePointModel: 'OCPP-1.6J-Sim',
  chargePointSerialNumber: 'SIM-001',
  firmwareVersion: '1.0.0',
};

/**
 * Build BootNotification request payload.
 */
export function bootNotificationPayload(overrides = {}) {
  return { ...DEFAULT_BOOT_PAYLOAD, ...overrides };
}

/**
 * Build Heartbeat request payload (empty object).
 */
export function heartbeatPayload() {
  return {};
}

/**
 * Build StatusNotification request payload.
 */
export function statusNotificationPayload(connectorId, status, errorCode = ChargePointErrorCode.NoError) {
  return {
    connectorId,
    errorCode,
    status,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Build Authorize request payload.
 */
export function authorizePayload(idTag) {
  return { idTag };
}

/**
 * Build StartTransaction request payload.
 */
export function startTransactionPayload(connectorId, idTag, meterStart, timestamp = new Date()) {
  return {
    connectorId,
    idTag,
    meterStart,
    timestamp: typeof timestamp === 'object' && timestamp?.toISOString
      ? timestamp.toISOString()
      : new Date(timestamp).toISOString(),
  };
}

/**
 * Build StopTransaction request payload.
 */
export function stopTransactionPayload(transactionId, meterStop, timestamp, reason = 'Local', idTag, transactionData) {
  const payload = {
    transactionId,
    meterStop,
    timestamp: typeof timestamp === 'object' && timestamp?.toISOString
      ? timestamp.toISOString()
      : new Date(timestamp).toISOString(),
    reason,
  };
  if (idTag) payload.idTag = idTag;
  if (transactionData && transactionData.length > 0) payload.transactionData = transactionData;
  return payload;
}

/**
 * Build MeterValues request payload.
 * meterValue: array of { timestamp, sampledValue: [{ value, measurand?, unit? }] }
 */
export function meterValuesPayload(connectorId, transactionId, meterValue) {
  const mv = Array.isArray(meterValue) ? meterValue : [meterValue];
  return {
    connectorId,
    transactionId,
    meterValue: mv.map((m) => {
      const sv = Array.isArray(m.sampledValue) ? m.sampledValue : [m.sampledValue ?? m];
      return {
        timestamp: (m.timestamp ?? new Date()).toISOString?.() ?? new Date().toISOString(),
        sampledValue: sv.map((s) =>
          typeof s === 'object'
            ? { value: String(s.value ?? s), measurand: s.measurand ?? 'Energy.Active.Import.Register', unit: s.unit ?? 'Wh' }
            : { value: String(s), measurand: 'Energy.Active.Import.Register', unit: 'Wh' }
        ),
      };
    }),
  };
}

/**
 * Create a sampled value entry for Energy.Active.Import.Register (Wh).
 */
export function energySampledValue(wh, timestamp = new Date()) {
  return {
    timestamp: typeof timestamp === 'object' && timestamp?.toISOString
      ? timestamp.toISOString()
      : new Date(timestamp).toISOString(),
    sampledValue: [
      {
        value: String(wh),
        measurand: 'Energy.Active.Import.Register',
        unit: 'Wh',
      },
    ],
  };
}

/** OCPP 1.6 measurand units */
export const MEASURAND_UNITS = {
  'Energy.Active.Import.Register': 'Wh',
  'Power.Active.Import': 'W',
  'Current.Import': 'A',
  Voltage: 'V',
  Temperature: 'Celcius',
  SOC: 'Percent',
};

/**
 * Build meter value sampled values from profile measurands.
 * @param {object} ctx - { meterWh, powerW, voltage, amperage, temperature? }
 * @param {string[]} measurands - e.g. ['Energy.Active.Import.Register', 'Power.Active.Import']
 */
export function buildSampledValues(ctx, measurands) {
  const ts = (ctx.timestamp ?? new Date()).toISOString?.() ?? new Date().toISOString();
  return measurands.map((m) => {
    let value, unit = MEASURAND_UNITS[m] ?? '';
    switch (m) {
      case 'Energy.Active.Import.Register':
        value = String(ctx.meterWh ?? 0);
        break;
      case 'Power.Active.Import':
        value = String(ctx.powerW ?? 0);
        break;
      case 'Current.Import':
        value = String(ctx.amperage ?? 0);
        break;
      case 'Voltage':
        value = String(ctx.voltage ?? 0);
        break;
      case 'Temperature':
        value = String(ctx.temperature ?? 25);
        break;
      case 'SOC':
        value = String(ctx.soc ?? 0);
        break;
      default:
        value = '0';
    }
    return { value, measurand: m, unit };
  });
}
