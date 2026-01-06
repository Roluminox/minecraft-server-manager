/**
 * Events logger for tracking server activities
 * Stores events in a simple JSON-lines file with rotation
 */

const fs = require('fs').promises;
const path = require('path');

const EventType = {
  // Server lifecycle
  SERVER_START: 'server_start',
  SERVER_STOP: 'server_stop',
  SERVER_RESTART: 'server_restart',
  SERVER_CRASH: 'server_crash',
  SERVER_READY: 'server_ready',

  // Backup
  BACKUP_START: 'backup_start',
  BACKUP_COMPLETE: 'backup_complete',
  BACKUP_FAILED: 'backup_failed',
  RESTORE_START: 'restore_start',
  RESTORE_COMPLETE: 'restore_complete',
  RESTORE_FAILED: 'restore_failed',

  // Config
  CONFIG_CHANGE: 'config_change',
  CONFIG_RELOAD: 'config_reload',

  // Players
  PLAYER_JOIN: 'player_join',
  PLAYER_LEAVE: 'player_leave',
  PLAYER_KICK: 'player_kick',
  WHITELIST_ADD: 'whitelist_add',
  WHITELIST_REMOVE: 'whitelist_remove',
  OP_ADD: 'op_add',
  OP_REMOVE: 'op_remove',

  // RCON
  RCON_COMMAND: 'rcon_command',
  RCON_CONNECT: 'rcon_connect',
  RCON_DISCONNECT: 'rcon_disconnect',

  // Docker
  DOCKER_READY: 'docker_ready',
  DOCKER_ERROR: 'docker_error',

  // App
  APP_START: 'app_start',
  APP_STOP: 'app_stop',
  ERROR: 'error',
};

class EventLogger {
  /**
   * @param {import('../paths').Paths} paths
   * @param {object} options
   * @param {number} options.maxEntries - Maximum entries to keep (default: 1000)
   */
  constructor(paths, options = {}) {
    this.logFile = paths.eventsLogFile;
    this.maxEntries = options.maxEntries || 1000;
  }

  /**
   * Log an event
   * @param {string} type - Event type from EventType
   * @param {object} data - Additional event data
   * @returns {Promise<object>} - The logged entry
   */
  async log(type, data = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      type,
      ...data,
    };

    await this._appendEntry(entry);
    return entry;
  }

  /**
   * Log server start
   * @param {object} data
   */
  async logServerStart(data = {}) {
    return this.log(EventType.SERVER_START, data);
  }

  /**
   * Log server stop
   * @param {object} data
   */
  async logServerStop(data = {}) {
    return this.log(EventType.SERVER_STOP, data);
  }

  /**
   * Log RCON command
   * @param {string} command
   * @param {string} source
   */
  async logRconCommand(command, source = 'console') {
    return this.log(EventType.RCON_COMMAND, {
      command: command.substring(0, 100), // Truncate for safety
      source,
    });
  }

  /**
   * Log config change
   * @param {string} key
   * @param {any} oldValue
   * @param {any} newValue
   */
  async logConfigChange(key, oldValue, newValue) {
    return this.log(EventType.CONFIG_CHANGE, {
      key,
      oldValue: String(oldValue).substring(0, 50),
      newValue: String(newValue).substring(0, 50),
    });
  }

  /**
   * Log error
   * @param {string} message
   * @param {object} details
   */
  async logError(message, details = {}) {
    return this.log(EventType.ERROR, {
      message,
      ...details,
    });
  }

  // === Retrieval ===

  /**
   * Get recent events
   * @param {number} count - Number of events to retrieve
   * @returns {Promise<Array>}
   */
  async getRecent(count = 50) {
    try {
      const content = await fs.readFile(this.logFile, 'utf8');
      const entries = content
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      return entries.slice(-count).reverse();
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Get events by type
   * @param {string} type
   * @param {number} count
   * @returns {Promise<Array>}
   */
  async getByType(type, count = 50) {
    const all = await this.getRecent(this.maxEntries);
    return all.filter((e) => e.type === type).slice(0, count);
  }

  /**
   * Get events since a specific time
   * @param {Date|string} since
   * @returns {Promise<Array>}
   */
  async getSince(since) {
    const sinceDate = new Date(since);
    const all = await this.getRecent(this.maxEntries);
    return all.filter((e) => new Date(e.timestamp) > sinceDate);
  }

  /**
   * Clear all events
   */
  async clear() {
    try {
      await fs.writeFile(this.logFile, '', 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  // === Internal ===

  /**
   * Append entry to log file with rotation
   * @param {object} entry
   */
  async _appendEntry(entry) {
    try {
      // Ensure directory exists
      await fs.mkdir(path.dirname(this.logFile), { recursive: true });

      // Read existing entries
      let entries = [];
      try {
        const content = await fs.readFile(this.logFile, 'utf8');
        entries = content
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            try {
              return JSON.parse(line);
            } catch {
              return null;
            }
          })
          .filter(Boolean);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }

      // Add new entry
      entries.push(entry);

      // Apply rotation
      if (entries.length > this.maxEntries) {
        entries = entries.slice(-this.maxEntries);
      }

      // Write back
      const content = entries.map((e) => JSON.stringify(e)).join('\n');
      await fs.writeFile(this.logFile, content, 'utf8');
    } catch (error) {
      // Don't throw on logging errors, just log to console
      console.error('Failed to log event:', error);
    }
  }
}

module.exports = { EventLogger, EventType };
