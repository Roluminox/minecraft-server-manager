/**
 * Docker Compose management via CLI spawn
 * Uses spawn instead of dockerode because dockerode doesn't natively support Compose
 */

const { spawn } = require('child_process');
const Docker = require('dockerode');

class ComposeManager {
  /**
   * @param {import('../paths').Paths} paths
   * @param {object} options
   * @param {string} options.projectName - Docker Compose project name
   * @param {string} options.serviceName - Main service name (default: 'minecraft')
   */
  constructor(paths, options = {}) {
    this.paths = paths;
    this.docker = new Docker();
    // Project name defaults to directory name in docker compose
    this.projectName = options.projectName || 'minecraft';
    this.serviceName = options.serviceName || 'minecraft';
    this.containerName = options.containerName || 'minecraft-server';
  }

  // === Compose Commands via CLI ===

  /**
   * Start containers with docker compose up
   * @param {object} options
   * @param {boolean} options.build - Rebuild images
   * @param {boolean} options.forceRecreate - Force recreate containers
   * @returns {Promise<{stdout: string, stderr: string, code: number}>}
   */
  async up(options = {}) {
    const args = ['compose', '-f', this.paths.composeFile, 'up', '-d'];

    if (options.build) args.push('--build');
    if (options.forceRecreate) args.push('--force-recreate');

    return this._exec(args);
  }

  /**
   * Stop containers with docker compose down
   * @param {object} options
   * @param {boolean} options.removeVolumes - Remove volumes
   * @param {boolean} options.removeOrphans - Remove orphan containers
   * @returns {Promise<{stdout: string, stderr: string, code: number}>}
   */
  async down(options = {}) {
    const args = ['compose', '-f', this.paths.composeFile, 'down'];

    if (options.removeVolumes) args.push('-v');
    if (options.removeOrphans) args.push('--remove-orphans');

    return this._exec(args);
  }

  /**
   * Restart containers (down + up)
   * @returns {Promise<{stdout: string, stderr: string, code: number}>}
   */
  async restart() {
    await this.down();
    return this.up();
  }

  /**
   * Get container status via docker compose ps
   * @returns {Promise<{stdout: string, stderr: string, code: number}>}
   */
  async ps() {
    const args = ['compose', '-f', this.paths.composeFile, 'ps', '--format', 'json'];
    return this._exec(args);
  }

  /**
   * Pull latest images
   * @returns {Promise<{stdout: string, stderr: string, code: number}>}
   */
  async pull() {
    const args = ['compose', '-f', this.paths.composeFile, 'pull'];
    return this._exec(args);
  }

  // === Container Resolution (for dockerode operations) ===

  /**
   * Get container ID for a service
   * Used to get container reference for logs/stats via dockerode
   * @param {string} serviceName - Service name (default: this.serviceName)
   * @returns {Promise<string>} Container ID
   */
  async getServiceContainerId(serviceName = this.serviceName) {
    const containers = await this.docker.listContainers({
      all: true,
      filters: {
        label: [`com.docker.compose.project=${this.projectName}`]
      }
    });

    // Find container matching service name
    const container = containers.find(c => {
      const serviceLabel = c.Labels['com.docker.compose.service'];
      return serviceLabel === serviceName;
    });

    if (!container) {
      throw new Error(`Container for service '${serviceName}' not found. Is the server running?`);
    }

    return container.Id;
  }

  /**
   * Get dockerode Container instance for a service
   * @param {string} serviceName - Service name (default: this.serviceName)
   * @returns {Promise<Docker.Container>}
   */
  async getContainer(serviceName = this.serviceName) {
    // Try by container name first (more reliable)
    try {
      const container = this.docker.getContainer(this.containerName);
      await container.inspect(); // Verify it exists
      return container;
    } catch {
      // Fallback to service lookup
      const id = await this.getServiceContainerId(serviceName);
      return this.docker.getContainer(id);
    }
  }

  /**
   * Get container info (state, health, etc.)
   * @param {string} serviceName
   * @returns {Promise<object>}
   */
  async getContainerInfo(serviceName = this.serviceName) {
    try {
      const container = await this.getContainer(serviceName);
      const info = await container.inspect();

      return {
        id: info.Id,
        name: info.Name,
        state: info.State.Status,
        running: info.State.Running,
        paused: info.State.Paused,
        restarting: info.State.Restarting,
        startedAt: info.State.StartedAt,
        finishedAt: info.State.FinishedAt,
        exitCode: info.State.ExitCode,
        health: info.State.Health?.Status || null,
        ports: info.NetworkSettings?.Ports || {}
      };
    } catch (error) {
      if (error.message.includes('not found')) {
        return {
          state: 'not_found',
          running: false
        };
      }
      throw error;
    }
  }

  /**
   * Check if container is running
   * @param {string} serviceName
   * @returns {Promise<boolean>}
   */
  async isRunning(serviceName = this.serviceName) {
    try {
      const info = await this.getContainerInfo(serviceName);
      return info.running === true;
    } catch {
      return false;
    }
  }

  // === CLI Execution ===

  /**
   * Execute docker command via spawn
   * @param {string[]} args - Command arguments
   * @returns {Promise<{stdout: string, stderr: string, code: number}>}
   */
  _exec(args) {
    return new Promise((resolve, reject) => {
      const proc = spawn('docker', args, {
        cwd: this.paths.projectRoot,
        env: { ...process.env },
        shell: true
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr, code });
        } else {
          const error = new Error(`docker compose failed (code ${code}): ${stderr}`);
          error.code = code;
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
        }
      });

      proc.on('error', (error) => {
        reject(new Error(`Failed to spawn docker: ${error.message}`));
      });
    });
  }
}

module.exports = { ComposeManager };
