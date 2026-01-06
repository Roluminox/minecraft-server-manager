/**
 * Centralized logging with Pino
 * Provides structured JSON logging with pretty output in development
 */

const pino = require('pino');

// Determine if we're in development
const isDev = process.env.NODE_ENV !== 'production';

// Log level from environment or default
const LOG_LEVEL = process.env.LOG_LEVEL || (isDev ? 'debug' : 'info');

// Base Pino configuration
const pinoConfig = {
  level: LOG_LEVEL,
  base: {
    pid: undefined, // Don't include pid in logs
  },
  timestamp: pino.stdTimeFunctions.isoTime,
};

// In development, use pino-pretty for readable output
const transport = isDev
  ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname',
        messageFormat: '{if module}[{module}] {end}{msg}',
      },
    }
  : undefined;

// Create root logger
const rootLogger = transport ? pino(pinoConfig, pino.transport(transport)) : pino(pinoConfig);

/**
 * Create a child logger with a module name
 * @param {string} module - Module name for log prefix
 * @returns {import('pino').Logger}
 */
function createLogger(module) {
  return rootLogger.child({ module });
}

// Pre-created loggers for common modules
const loggers = {
  docker: createLogger('Docker'),
  rcon: createLogger('RCON'),
  backup: createLogger('Backup'),
  config: createLogger('Config'),
  server: createLogger('Server'),
  ipc: createLogger('IPC'),
  app: createLogger('App'),
};

/**
 * Get or create a logger for a module
 * @param {string} module - Module name
 * @returns {import('pino').Logger}
 */
function getLogger(module) {
  if (!loggers[module.toLowerCase()]) {
    loggers[module.toLowerCase()] = createLogger(module);
  }
  return loggers[module.toLowerCase()];
}

/**
 * Set global log level
 * @param {string} level - 'debug' | 'info' | 'warn' | 'error' | 'fatal'
 */
function setLogLevel(level) {
  rootLogger.level = level;
}

// Legacy exports for backward compatibility
const LogLevel = {
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40,
  NONE: 60,
};

module.exports = {
  // New Pino-based API
  rootLogger,
  createLogger,
  getLogger,
  setLogLevel,
  loggers,

  // Legacy exports (for gradual migration)
  Logger: class LegacyLogger {
    constructor(options = {}) {
      this.pino = options.prefix ? createLogger(options.prefix) : rootLogger;
    }
    child(prefix) {
      return { pino: this.pino.child({ module: prefix }) };
    }
    debug(msg, data) {
      this.pino.debug(data, msg);
    }
    info(msg, data) {
      this.pino.info(data, msg);
    }
    warn(msg, data) {
      this.pino.warn(data, msg);
    }
    error(msg, data) {
      this.pino.error(data, msg);
    }
  },
  LogLevel,
  defaultLogger: rootLogger,
};
