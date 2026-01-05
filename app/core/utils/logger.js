/**
 * Simple structured logger
 */

const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4
};

class Logger {
  /**
   * @param {object} options
   * @param {string} options.prefix - Log prefix
   * @param {number} options.level - Minimum log level
   * @param {boolean} options.timestamps - Include timestamps
   * @param {boolean} options.colors - Use colors (for terminal)
   */
  constructor(options = {}) {
    this.prefix = options.prefix || '';
    this.level = options.level !== undefined ? options.level : LogLevel.INFO;
    this.timestamps = options.timestamps !== false;
    this.colors = options.colors !== false;
  }

  /**
   * Create a child logger with a prefix
   * @param {string} prefix
   * @returns {Logger}
   */
  child(prefix) {
    return new Logger({
      prefix: this.prefix ? `${this.prefix}:${prefix}` : prefix,
      level: this.level,
      timestamps: this.timestamps,
      colors: this.colors
    });
  }

  /**
   * Set log level
   * @param {number} level
   */
  setLevel(level) {
    this.level = level;
  }

  /**
   * Log debug message
   * @param {string} message
   * @param {object} data
   */
  debug(message, data = {}) {
    this._log(LogLevel.DEBUG, 'DEBUG', message, data);
  }

  /**
   * Log info message
   * @param {string} message
   * @param {object} data
   */
  info(message, data = {}) {
    this._log(LogLevel.INFO, 'INFO', message, data);
  }

  /**
   * Log warning message
   * @param {string} message
   * @param {object} data
   */
  warn(message, data = {}) {
    this._log(LogLevel.WARN, 'WARN', message, data);
  }

  /**
   * Log error message
   * @param {string} message
   * @param {Error|object} errorOrData
   */
  error(message, errorOrData = {}) {
    const data = errorOrData instanceof Error
      ? { error: errorOrData.message, stack: errorOrData.stack }
      : errorOrData;

    this._log(LogLevel.ERROR, 'ERROR', message, data);
  }

  /**
   * Internal log method
   * @param {number} level
   * @param {string} levelName
   * @param {string} message
   * @param {object} data
   */
  _log(level, levelName, message, data) {
    if (level < this.level) return;

    const parts = [];

    // Timestamp
    if (this.timestamps) {
      parts.push(this._formatTimestamp());
    }

    // Level
    parts.push(this._formatLevel(levelName));

    // Prefix
    if (this.prefix) {
      parts.push(`[${this.prefix}]`);
    }

    // Message
    parts.push(message);

    // Data
    const dataStr = this._formatData(data);
    if (dataStr) {
      parts.push(dataStr);
    }

    const output = parts.join(' ');

    // Output to console
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(output);
        break;
      case LogLevel.WARN:
        console.warn(output);
        break;
      case LogLevel.ERROR:
        console.error(output);
        break;
      default:
        console.log(output);
    }
  }

  /**
   * Format timestamp
   * @returns {string}
   */
  _formatTimestamp() {
    const now = new Date();
    const time = now.toISOString().slice(11, 23);
    return this.colors ? `\x1b[90m${time}\x1b[0m` : time;
  }

  /**
   * Format log level
   * @param {string} level
   * @returns {string}
   */
  _formatLevel(level) {
    if (!this.colors) {
      return `[${level}]`;
    }

    const colors = {
      DEBUG: '\x1b[90m',  // Gray
      INFO: '\x1b[36m',   // Cyan
      WARN: '\x1b[33m',   // Yellow
      ERROR: '\x1b[31m'   // Red
    };

    const color = colors[level] || '';
    return `${color}[${level}]\x1b[0m`;
  }

  /**
   * Format data object
   * @param {object} data
   * @returns {string}
   */
  _formatData(data) {
    if (!data || Object.keys(data).length === 0) {
      return '';
    }

    try {
      const str = JSON.stringify(data);
      return this.colors ? `\x1b[90m${str}\x1b[0m` : str;
    } catch {
      return '';
    }
  }
}

// Default logger instance
const defaultLogger = new Logger();

module.exports = {
  Logger,
  LogLevel,
  defaultLogger
};
