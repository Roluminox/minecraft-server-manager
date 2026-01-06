/**
 * RCON client with auto-reconnect, command queue, and heartbeat
 */

const { Rcon } = require('rcon-client');
const EventEmitter = require('events');
const { loggers } = require('../utils/logger');
const log = loggers.rcon;

class RconClient extends EventEmitter {
  /**
   * @param {object} config
   * @param {string} config.host - RCON host (default: '127.0.0.1')
   * @param {number} config.port - RCON port (default: 25575)
   * @param {string} config.password - RCON password
   * @param {number} config.timeout - Connection timeout in ms (default: 5000)
   */
  constructor(config) {
    super();
    this.config = {
      host: config.host || '127.0.0.1', // Force IPv4 to avoid ::1 issues on Windows
      port: config.port || 25575,
      password: config.password,
      timeout: config.timeout || 5000,
    };

    this.client = null;
    this.connected = false;
    this.reconnecting = false;

    // Command queue
    this.queue = [];
    this.processing = false;

    // Heartbeat
    this.heartbeatInterval = null;
    this.heartbeatMs = 30000; // 30 seconds
  }

  // === Connection ===

  /**
   * Connect with retry and exponential backoff
   * @param {object} options
   * @param {number} options.maxAttempts - Max connection attempts (default: 10)
   * @param {number} options.initialDelay - Initial delay in ms (default: 2000)
   * @param {number} options.maxDelay - Max delay between retries in ms (default: 30000)
   * @param {number} options.backoffFactor - Backoff multiplier (default: 1.5)
   * @param {function} options.onAttempt - Callback for each attempt
   */
  async connectWithRetry(options = {}) {
    const {
      maxAttempts = 10,
      initialDelay = 2000,
      maxDelay = 30000,
      backoffFactor = 1.5,
      onAttempt = () => {},
    } = options;

    let delay = initialDelay;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      onAttempt({
        attempt,
        maxAttempts,
        nextDelayMs: delay,
      });

      try {
        await this.connect();
        return; // Success
      } catch (error) {
        if (attempt === maxAttempts) {
          throw new Error(`RCON connection failed after ${maxAttempts} attempts: ${error.message}`);
        }

        await this._sleep(delay);
        delay = Math.min(delay * backoffFactor, maxDelay);
      }
    }
  }

  /**
   * Connect to RCON server
   */
  async connect() {
    if (this.connected) return;

    log.info({ host: this.config.host, port: this.config.port }, 'Connecting...');
    this.client = await Rcon.connect(this.config);
    this.connected = true;
    log.info('Connected!');

    // Setup disconnect handler
    this.client.on('end', () => {
      log.info('Connection ended');
      this._handleDisconnect();
    });
    this.client.on('error', (error) => {
      log.error({ err: error }, 'Connection error');
      this.emit('error', error);
    });

    // Start heartbeat
    this._startHeartbeat();

    this.emit('connected');
  }

  /**
   * Disconnect from RCON server
   */
  async disconnect() {
    this._stopHeartbeat();

    if (this.client) {
      try {
        await this.client.end();
      } catch (e) {
        // Ignore disconnect errors
      }
      this.client = null;
    }

    this.connected = false;
    this.queue = [];
    this.processing = false;
  }

  // === Auto-Reconnect ===

  /**
   * Handle disconnection
   */
  _handleDisconnect() {
    this.connected = false;
    this._stopHeartbeat();
    this.emit('disconnected');

    if (!this.reconnecting) {
      this._autoReconnect();
    }
  }

  /**
   * Attempt to auto-reconnect
   */
  async _autoReconnect() {
    this.reconnecting = true;
    this.emit('reconnecting');

    try {
      await this.connectWithRetry({
        maxAttempts: 5,
        initialDelay: 5000,
        onAttempt: (info) => this.emit('reconnect-attempt', info),
      });

      this.reconnecting = false;
      this.emit('reconnected');

      // Process any queued commands
      this._processQueue();
    } catch (error) {
      this.reconnecting = false;
      this.emit('reconnect-failed', error);
    }
  }

  // === Heartbeat ===

  /**
   * Start heartbeat to keep connection alive
   */
  _startHeartbeat() {
    this._stopHeartbeat();

    this.heartbeatInterval = setInterval(async () => {
      if (!this.connected) return;

      try {
        // Send lightweight command
        await this._sendDirect('list');
      } catch (error) {
        // Disconnect will be handled by 'end' event
        this.emit('heartbeat-failed', error);
      }
    }, this.heartbeatMs);
  }

  /**
   * Stop heartbeat
   */
  _stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Set heartbeat interval
   * @param {number} ms
   */
  setHeartbeatInterval(ms) {
    this.heartbeatMs = ms;
    if (this.connected) {
      this._startHeartbeat();
    }
  }

  // === Command Queue ===

  /**
   * Send command (queued)
   * @param {string} command
   * @returns {Promise<string>}
   */
  async send(command) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        command,
        resolve,
        reject,
        timestamp: Date.now(),
      });

      this._processQueue();
    });
  }

  /**
   * Send command directly (bypass queue)
   * @param {string} command
   * @returns {Promise<string>}
   */
  async _sendDirect(command) {
    if (!this.connected || !this.client) {
      throw new Error('RCON not connected');
    }

    return this.client.send(command);
  }

  /**
   * Process command queue
   */
  async _processQueue() {
    if (this.processing || this.queue.length === 0) return;

    if (!this.connected) {
      // Reject all queued commands if not connected and not reconnecting
      if (!this.reconnecting) {
        while (this.queue.length > 0) {
          const queued = this.queue.shift();
          queued.reject(new Error('RCON not connected'));
        }
      }
      return;
    }

    this.processing = true;

    while (this.queue.length > 0 && this.connected) {
      const { command, resolve, reject } = this.queue.shift();

      try {
        const response = await this._sendDirect(command);
        resolve(response);
      } catch (error) {
        reject(error);
      }
    }

    this.processing = false;
  }

  // === Status ===

  /**
   * Check if connected
   * @returns {boolean}
   */
  isConnected() {
    return this.connected;
  }

  /**
   * Get connection status
   * @returns {{connected: boolean, reconnecting: boolean, queueLength: number}}
   */
  getStatus() {
    return {
      connected: this.connected,
      reconnecting: this.reconnecting,
      queueLength: this.queue.length,
    };
  }

  // === Utility ===

  /**
   * Sleep helper
   * @param {number} ms
   */
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = { RconClient };
