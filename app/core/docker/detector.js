/**
 * Docker daemon detection with granular states and recommended actions
 */

const { exec } = require('child_process');
const Docker = require('dockerode');

const DockerState = {
  NOT_INSTALLED: 'not_installed',
  DAEMON_OFF: 'daemon_off',
  DAEMON_STARTING: 'daemon_starting',
  DAEMON_READY: 'daemon_ready',
  WSL2_ERROR: 'wsl2_error',
  PERMISSION_DENIED: 'permission_denied',
  UNKNOWN_ERROR: 'unknown_error'
};

const NextAction = {
  INSTALL_DOCKER: 'install_docker',
  OPEN_DOCKER_DESKTOP: 'open_docker_desktop',
  WAIT: 'wait',
  CHECK_WSL2: 'check_wsl2',
  CHECK_PERMISSIONS: 'check_permissions',
  NONE: 'none'
};

class DockerDetector {
  constructor() {
    this.docker = new Docker();
  }

  /**
   * Detect Docker daemon state
   * @returns {Promise<{state: string, message: string, nextAction: string, details: object}>}
   */
  async detect() {
    // 1. Check CLI installation
    const cliInstalled = await this._checkCli();
    if (!cliInstalled) {
      return {
        state: DockerState.NOT_INSTALLED,
        message: 'Docker is not installed on this system',
        nextAction: NextAction.INSTALL_DOCKER,
        details: {
          downloadUrl: 'https://docs.docker.com/desktop/install/windows-install/'
        }
      };
    }

    // 2. Ping daemon via socket
    try {
      await this.docker.ping();
      const info = await this.docker.info();

      return {
        state: DockerState.DAEMON_READY,
        message: 'Docker daemon ready',
        nextAction: NextAction.NONE,
        details: {
          version: info.ServerVersion,
          containersRunning: info.ContainersRunning,
          containersPaused: info.ContainersPaused,
          containersStopped: info.ContainersStopped,
          images: info.Images,
          os: info.OperatingSystem,
          architecture: info.Architecture,
          memoryTotal: info.MemTotal
        }
      };
    } catch (error) {
      return this._analyzeError(error);
    }
  }

  /**
   * Analyze Docker connection error and return appropriate state
   * @param {Error} error
   * @returns {{state: string, message: string, nextAction: string, details: object}}
   */
  _analyzeError(error) {
    const msg = error.message || '';
    const code = error.code || '';

    // ECONNREFUSED = daemon not started
    if (code === 'ECONNREFUSED' || msg.includes('ECONNREFUSED')) {
      return {
        state: DockerState.DAEMON_OFF,
        message: 'Docker Desktop is not running',
        nextAction: NextAction.OPEN_DOCKER_DESKTOP,
        details: { error: 'Connection refused', code }
      };
    }

    // ENOENT = socket not found (daemon not running)
    if (code === 'ENOENT' || msg.includes('ENOENT')) {
      return {
        state: DockerState.DAEMON_OFF,
        message: 'Docker daemon socket not found',
        nextAction: NextAction.OPEN_DOCKER_DESKTOP,
        details: { error: 'Socket not found', code }
      };
    }

    // EACCES/EPERM = permissions issue
    if (code === 'EACCES' || code === 'EPERM') {
      return {
        state: DockerState.PERMISSION_DENIED,
        message: 'Permission denied accessing Docker daemon',
        nextAction: NextAction.CHECK_PERMISSIONS,
        details: { error: error.message, code }
      };
    }

    // WSL2 errors
    if (msg.includes('WSL') || msg.includes('wsl')) {
      return {
        state: DockerState.WSL2_ERROR,
        message: 'WSL2 backend issue',
        nextAction: NextAction.CHECK_WSL2,
        details: { error: error.message }
      };
    }

    // Unknown error
    return {
      state: DockerState.UNKNOWN_ERROR,
      message: 'Unknown Docker error',
      nextAction: NextAction.OPEN_DOCKER_DESKTOP,
      details: { error: error.message, code }
    };
  }

  /**
   * Check if Docker CLI is installed
   * @returns {Promise<boolean>}
   */
  async _checkCli() {
    return new Promise((resolve) => {
      exec('docker --version', (error) => {
        resolve(!error);
      });
    });
  }

  /**
   * Open Docker Desktop application (Windows)
   * @returns {Promise<void>}
   */
  async openDockerDesktop() {
    return new Promise((resolve, reject) => {
      // Try common installation paths
      const paths = [
        'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe',
        `${process.env.LOCALAPPDATA}\\Docker\\Docker Desktop.exe`
      ];

      const tryOpen = (pathIndex) => {
        if (pathIndex >= paths.length) {
          // Fallback: try to start via shell
          exec('start docker', (error) => {
            if (error) {
              reject(new Error('Could not find Docker Desktop'));
            } else {
              resolve();
            }
          });
          return;
        }

        exec(`start "" "${paths[pathIndex]}"`, (error) => {
          if (error) {
            tryOpen(pathIndex + 1);
          } else {
            resolve();
          }
        });
      };

      tryOpen(0);
    });
  }

  /**
   * Wait until Docker daemon is ready
   * @param {object} options
   * @param {number} options.maxAttempts - Maximum number of attempts (default: 30)
   * @param {number} options.intervalMs - Interval between attempts in ms (default: 2000)
   * @param {function} options.onAttempt - Callback for each attempt
   * @returns {Promise<object>} - Detection result when ready
   */
  async waitUntilReady(options = {}) {
    const {
      maxAttempts = 30,
      intervalMs = 2000,
      onAttempt = () => {}
    } = options;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      onAttempt({
        attempt,
        maxAttempts,
        elapsedMs: (attempt - 1) * intervalMs,
        totalMs: maxAttempts * intervalMs
      });

      const result = await this.detect();
      if (result.state === DockerState.DAEMON_READY) {
        return result;
      }

      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, intervalMs));
      }
    }

    throw new Error(`Docker daemon not ready after ${maxAttempts} attempts (${maxAttempts * intervalMs / 1000}s)`);
  }
}

module.exports = { DockerDetector, DockerState, NextAction };
