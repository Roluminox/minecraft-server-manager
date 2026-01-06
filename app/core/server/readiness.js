/**
 * Server readiness checker
 * Checks container running, "Done" log message, and port accessibility
 */

const net = require('net');

class ReadinessChecker {
  /**
   * @param {import('../docker/compose').ComposeManager} compose
   * @param {object} options
   * @param {string} options.host - Server host (default: 'localhost')
   * @param {number} options.port - Minecraft port (default: 25565)
   * @param {number} options.rconPort - RCON port (default: 25575)
   */
  constructor(compose, options = {}) {
    this.compose = compose;
    this.host = options.host || 'localhost';
    this.port = options.port || 25565;
    this.rconPort = options.rconPort || 25575;
  }

  /**
   * Wait for server to be fully ready
   * @param {object} options
   * @param {number} options.timeoutMs - Total timeout in ms (default: 180000 = 3 min)
   * @param {number} options.pollIntervalMs - Poll interval in ms (default: 2000)
   * @param {function} options.onProgress - Progress callback
   * @returns {Promise<{ready: boolean, rconReady: boolean, startupTimeMs: number}>}
   */
  async waitForReady(options = {}) {
    const { timeoutMs = 180000, pollIntervalMs = 2000, onProgress = () => {} } = options;

    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const elapsed = Date.now() - startTime;

      // 1. Check container running
      const containerRunning = await this._checkContainerRunning();
      if (!containerRunning) {
        onProgress({
          phase: 'waiting-container',
          message: 'Waiting for container to start...',
          elapsedMs: elapsed,
          timeoutMs,
        });
        await this._sleep(pollIntervalMs);
        continue;
      }

      // 2. Check "Done" in logs
      const doneLogged = await this._checkDoneLog();
      if (!doneLogged) {
        onProgress({
          phase: 'waiting-startup',
          message: 'Waiting for server to finish starting...',
          elapsedMs: elapsed,
          timeoutMs,
        });
        await this._sleep(pollIntervalMs);
        continue;
      }

      // 3. Check Minecraft port
      const portReady = await this._checkPort(this.port);
      if (!portReady) {
        onProgress({
          phase: 'waiting-port',
          message: 'Waiting for server port to be accessible...',
          elapsedMs: elapsed,
          timeoutMs,
        });
        await this._sleep(pollIntervalMs);
        continue;
      }

      // 4. Check RCON port (optional, don't fail if not ready)
      const rconReady = await this._checkPort(this.rconPort);

      onProgress({
        phase: 'ready',
        message: 'Server is ready!',
        elapsedMs: elapsed,
        timeoutMs,
      });

      return {
        ready: true,
        rconReady,
        startupTimeMs: elapsed,
      };
    }

    throw new Error(`Server not ready after ${timeoutMs}ms timeout`);
  }

  /**
   * Quick check if server is ready (non-blocking)
   * @returns {Promise<{containerRunning: boolean, serverReady: boolean, portOpen: boolean, rconOpen: boolean}>}
   */
  async checkStatus() {
    const [containerRunning, serverReady, portOpen, rconOpen] = await Promise.all([
      this._checkContainerRunning(),
      this._checkDoneLog(),
      this._checkPort(this.port),
      this._checkPort(this.rconPort),
    ]);

    return {
      containerRunning,
      serverReady,
      portOpen,
      rconOpen,
      fullyReady: containerRunning && serverReady && portOpen,
    };
  }

  // === Individual Checks ===

  /**
   * Check if container is running
   * @returns {Promise<boolean>}
   */
  async _checkContainerRunning() {
    try {
      const container = await this.compose.getContainer();
      const info = await container.inspect();
      return info.State.Running === true;
    } catch {
      return false;
    }
  }

  /**
   * Check for "Done" message in logs
   * @returns {Promise<boolean>}
   */
  async _checkDoneLog() {
    try {
      const container = await this.compose.getContainer();

      const logs = await container.logs({
        stdout: true,
        stderr: true,
        tail: 100,
        timestamps: false,
      });

      // Docker logs have 8-byte header per chunk, strip non-printable chars
      // eslint-disable-next-line no-control-regex
      const logText = logs.toString('utf8').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

      // Look for various "Done" patterns
      // Vanilla/Paper: "Done (X.XXXs)! For help, type "help""
      // Forge: "Done (X.XXXs)! For help, type "help" or "?""
      // Also check for "RCON running" as alternative
      const hasDone = logText.includes('Done') && logText.includes('For help');
      const hasRcon = logText.includes('RCON running');

      return hasDone || hasRcon;
    } catch (error) {
      console.error('Check done log error:', error.message);
      return false;
    }
  }

  /**
   * Check if port is accessible
   * @param {number} port
   * @returns {Promise<boolean>}
   */
  async _checkPort(port) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(2000);

      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });

      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });

      socket.connect(port, this.host);
    });
  }

  /**
   * Sleep helper
   * @param {number} ms
   */
  _sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
}

module.exports = { ReadinessChecker };
