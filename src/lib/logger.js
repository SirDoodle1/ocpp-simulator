/**
 * Logging utility with level support.
 * Set LOG_LEVEL=debug|info|warn|error (default: info in dev, warn in production)
 */
const levels = { debug: 0, info: 1, warn: 2, error: 3 };
const defaultLevel = process.env.NODE_ENV === 'production' ? 'warn' : 'info';
const currentLevel = levels[process.env.LOG_LEVEL?.toLowerCase()] ?? levels[defaultLevel];

function shouldLog(level) {
  return levels[level] >= currentLevel;
}

function format(...args) {
  return args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
}

export const logger = {
  debug(...args) {
    if (shouldLog('debug')) console.log('[DEBUG]', format(...args));
  },
  info(...args) {
    if (shouldLog('info')) console.log(format(...args));
  },
  warn(...args) {
    if (shouldLog('warn')) console.warn('[WARN]', format(...args));
  },
  error(...args) {
    if (shouldLog('error')) console.error('[ERROR]', format(...args));
  },
};

const ts = () => new Date().toISOString();

/** Log OCPP message with timestamp and direction. Always logs at info level. */
export function logOcppMessage(direction, message) {
  const prefix = direction === 'sent' ? '→' : '←';
  const msg = typeof message === 'string' ? message : String(message ?? '');
  logger.info(`[${ts()}] OCPP ${prefix} ${msg}`);
}
