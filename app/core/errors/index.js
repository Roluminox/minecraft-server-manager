/**
 * Centralized error handling
 * Provides typed errors with codes for consistent error handling across the app
 */

/**
 * Error codes enum
 */
const ErrorCode = {
  // General
  UNKNOWN: 'UNKNOWN',
  TIMEOUT: 'TIMEOUT',
  CANCELLED: 'CANCELLED',

  // Docker
  DOCKER_NOT_RUNNING: 'DOCKER_NOT_RUNNING',
  DOCKER_NOT_INSTALLED: 'DOCKER_NOT_INSTALLED',
  DOCKER_CONNECTION_FAILED: 'DOCKER_CONNECTION_FAILED',
  CONTAINER_NOT_FOUND: 'CONTAINER_NOT_FOUND',
  CONTAINER_NOT_RUNNING: 'CONTAINER_NOT_RUNNING',

  // RCON
  RCON_NOT_CONNECTED: 'RCON_NOT_CONNECTED',
  RCON_CONNECTION_FAILED: 'RCON_CONNECTION_FAILED',
  RCON_AUTH_FAILED: 'RCON_AUTH_FAILED',
  RCON_COMMAND_FAILED: 'RCON_COMMAND_FAILED',
  RCON_PASSWORD_MISSING: 'RCON_PASSWORD_MISSING',

  // Server
  SERVER_NOT_RUNNING: 'SERVER_NOT_RUNNING',
  SERVER_START_FAILED: 'SERVER_START_FAILED',
  SERVER_STOP_FAILED: 'SERVER_STOP_FAILED',
  SERVER_NOT_READY: 'SERVER_NOT_READY',

  // Config
  CONFIG_INVALID_KEY: 'CONFIG_INVALID_KEY',
  CONFIG_INVALID_VALUE: 'CONFIG_INVALID_VALUE',
  CONFIG_READ_FAILED: 'CONFIG_READ_FAILED',
  CONFIG_WRITE_FAILED: 'CONFIG_WRITE_FAILED',

  // Backup
  BACKUP_IN_PROGRESS: 'BACKUP_IN_PROGRESS',
  BACKUP_FAILED: 'BACKUP_FAILED',
  BACKUP_NOT_FOUND: 'BACKUP_NOT_FOUND',
  RESTORE_FAILED: 'RESTORE_FAILED',

  // Validation
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INVALID_INPUT: 'INVALID_INPUT',

  // File system
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_READ_FAILED: 'FILE_READ_FAILED',
  FILE_WRITE_FAILED: 'FILE_WRITE_FAILED',
};

/**
 * Base application error class
 * All custom errors should extend this
 */
class AppError extends Error {
  /**
   * @param {string} message - Human readable error message
   * @param {string} code - Error code from ErrorCode enum
   * @param {object} details - Additional error details
   * @param {Error} cause - Original error that caused this error
   */
  constructor(message, code = ErrorCode.UNKNOWN, details = {}, cause = null) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    this.cause = cause;
    this.timestamp = new Date().toISOString();

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert to plain object for serialization (IPC, logging)
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp,
      stack: this.stack,
      cause: this.cause?.message,
    };
  }

  /**
   * Check if error matches a specific code
   * @param {string} code
   */
  is(code) {
    return this.code === code;
  }
}

/**
 * Docker-related errors
 */
class DockerError extends AppError {
  constructor(message, code = ErrorCode.DOCKER_CONNECTION_FAILED, details = {}, cause = null) {
    super(message, code, details, cause);
  }
}

/**
 * RCON connection/command errors
 */
class RconError extends AppError {
  constructor(message, code = ErrorCode.RCON_CONNECTION_FAILED, details = {}, cause = null) {
    super(message, code, details, cause);
  }
}

/**
 * Server lifecycle errors
 */
class ServerError extends AppError {
  constructor(message, code = ErrorCode.SERVER_NOT_RUNNING, details = {}, cause = null) {
    super(message, code, details, cause);
  }
}

/**
 * Configuration errors
 */
class ConfigError extends AppError {
  constructor(message, code = ErrorCode.CONFIG_INVALID_KEY, details = {}, cause = null) {
    super(message, code, details, cause);
  }
}

/**
 * Backup/restore errors
 */
class BackupError extends AppError {
  constructor(message, code = ErrorCode.BACKUP_FAILED, details = {}, cause = null) {
    super(message, code, details, cause);
  }
}

/**
 * Input validation errors
 */
class ValidationError extends AppError {
  constructor(message, code = ErrorCode.VALIDATION_FAILED, details = {}, cause = null) {
    super(message, code, details, cause);
  }
}

/**
 * Timeout errors
 */
class TimeoutError extends AppError {
  constructor(message, details = {}, cause = null) {
    super(message, ErrorCode.TIMEOUT, details, cause);
  }
}

// === Helper functions ===

/**
 * Wrap an error with AppError if it isn't already
 * @param {Error} error
 * @param {string} code - Default error code
 * @returns {AppError}
 */
function wrapError(error, code = ErrorCode.UNKNOWN) {
  if (error instanceof AppError) {
    return error;
  }
  return new AppError(error.message, code, {}, error);
}

/**
 * Check if an error is a specific type
 * @param {Error} error
 * @param {string} code
 */
function isErrorCode(error, code) {
  return error instanceof AppError && error.code === code;
}

/**
 * Create error from code with default message
 * @param {string} code
 * @param {object} details
 */
function createError(code, details = {}) {
  const messages = {
    [ErrorCode.DOCKER_NOT_RUNNING]: 'Docker is not running',
    [ErrorCode.DOCKER_NOT_INSTALLED]: 'Docker is not installed',
    [ErrorCode.CONTAINER_NOT_FOUND]: 'Container not found',
    [ErrorCode.CONTAINER_NOT_RUNNING]: 'Container is not running',
    [ErrorCode.RCON_NOT_CONNECTED]: 'RCON is not connected. Is the server running?',
    [ErrorCode.RCON_PASSWORD_MISSING]: 'RCON password is not configured',
    [ErrorCode.SERVER_NOT_RUNNING]: 'Server is not running',
    [ErrorCode.SERVER_NOT_READY]: 'Server is not ready',
    [ErrorCode.BACKUP_IN_PROGRESS]: 'A backup operation is already in progress',
    [ErrorCode.RATE_LIMIT_EXCEEDED]: 'Rate limit exceeded',
    [ErrorCode.TIMEOUT]: 'Operation timed out',
  };

  const message = messages[code] || `Error: ${code}`;
  return new AppError(message, code, details);
}

module.exports = {
  // Error codes
  ErrorCode,

  // Error classes
  AppError,
  DockerError,
  RconError,
  ServerError,
  ConfigError,
  BackupError,
  ValidationError,
  TimeoutError,

  // Helpers
  wrapError,
  isErrorCode,
  createError,
};
