/**
 * Backup Helper - Uses Alpine container for cross-platform tar/gzip
 * This avoids Windows path issues and missing tar commands
 */

const Docker = require('dockerode');
const path = require('path');

class BackupHelper {
  /**
   * @param {Docker} docker - Dockerode instance
   * @param {import('../paths').Paths} paths
   */
  constructor(docker, paths) {
    this.docker = docker;
    this.paths = paths;
    this.helperImage = 'alpine:latest';
    this.dataVolume = 'minecraft-data';
    this.backupVolume = 'minecraft-backups';
  }

  /**
   * Ensure Alpine image is available
   */
  async ensureImage() {
    try {
      await this.docker.getImage(this.helperImage).inspect();
    } catch {
      console.log('Pulling Alpine image for backup helper...');
      await new Promise((resolve, reject) => {
        this.docker.pull(this.helperImage, (err, stream) => {
          if (err) return reject(err);
          this.docker.modem.followProgress(stream, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      });
    }
  }

  /**
   * Run a helper container and get output
   * @param {string[]} cmd - Command to run
   * @param {object} binds - Volume binds
   * @returns {Promise<string>} - Container output
   */
  async _runHelper(cmd, binds) {
    await this.ensureImage();

    const container = await this.docker.createContainer({
      Image: this.helperImage,
      Cmd: cmd,
      HostConfig: {
        Binds: binds
      },
      AttachStdout: true,
      AttachStderr: true
    });

    try {
      // Attach before starting to capture all output
      const stream = await container.attach({
        stream: true,
        stdout: true,
        stderr: true
      });

      let output = '';
      stream.on('data', (chunk) => {
        output += chunk.toString();
      });

      await container.start();
      await container.wait();

      // Give stream time to flush
      await new Promise(resolve => setTimeout(resolve, 100));

      return output;
    } finally {
      // Clean up container
      try {
        await container.remove({ force: true });
      } catch {
        // Ignore removal errors
      }
    }
  }

  /**
   * Create a backup of the world
   * @param {string} backupName - Name for the backup file (without extension)
   * @param {object} options
   * @param {boolean} options.compress - Use gzip compression (default: true)
   * @param {function} options.onProgress - Progress callback
   * @returns {Promise<{success: boolean, filename: string, size: number}>}
   */
  async createBackup(backupName, options = {}) {
    const { compress = true, onProgress = () => {} } = options;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${backupName}_${timestamp}.tar${compress ? '.gz' : ''}`;

    onProgress({ phase: 'starting', message: 'Starting backup...' });
    onProgress({ phase: 'running', message: 'Creating archive...' });

    const cmd = compress
      ? ['sh', '-c', `cd /data && tar czf /backups/${filename} world 2>/dev/null && stat -c%s /backups/${filename}`]
      : ['sh', '-c', `cd /data && tar cf /backups/${filename} world 2>/dev/null && stat -c%s /backups/${filename}`];

    const output = await this._runHelper(cmd, [
      `${this.dataVolume}:/data:ro`,
      `${this.backupVolume}:/backups`
    ]);

    // Parse size from output (just the number)
    const sizeMatch = output.match(/(\d+)/);
    const size = sizeMatch ? parseInt(sizeMatch[1], 10) : 0;

    onProgress({ phase: 'complete', message: 'Backup complete!', filename, size });

    return {
      success: true,
      filename,
      size,
      path: `/backups/${filename}`
    };
  }

  /**
   * Restore a backup
   * @param {string} filename - Backup filename to restore
   * @param {object} options
   * @param {function} options.onProgress - Progress callback
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async restoreBackup(filename, options = {}) {
    const { onProgress = () => {} } = options;

    const isCompressed = filename.endsWith('.gz');

    onProgress({ phase: 'starting', message: 'Starting restore...' });
    onProgress({ phase: 'running', message: 'Extracting backup...' });

    const cmd = isCompressed
      ? ['sh', '-c', `cd /data && rm -rf world.old && mv world world.old 2>/dev/null; tar xzf /backups/${filename} && echo "RESTORED"`]
      : ['sh', '-c', `cd /data && rm -rf world.old && mv world world.old 2>/dev/null; tar xf /backups/${filename} && echo "RESTORED"`];

    const output = await this._runHelper(cmd, [
      `${this.dataVolume}:/data`,
      `${this.backupVolume}:/backups:ro`
    ]);

    const success = output.includes('RESTORED');

    onProgress({
      phase: 'complete',
      message: success ? 'Restore complete!' : 'Restore failed',
      success
    });

    return {
      success,
      message: success ? 'World restored successfully. Old world saved as world.old' : 'Failed to restore backup'
    };
  }

  /**
   * List available backups
   * @returns {Promise<{name: string, size: number, date: Date}[]>}
   */
  async listBackups() {
    const output = await this._runHelper(
      ['sh', '-c', 'ls -la /backups/*.tar* 2>/dev/null || echo "EMPTY"'],
      [`${this.backupVolume}:/backups:ro`]
    );

    if (output.includes('EMPTY')) {
      return [];
    }

    // Parse ls -la output
    const lines = output.split('\n').filter(line => line.includes('.tar'));
    const backups = [];

    for (const line of lines) {
      // Format: -rw-r--r-- 1 root root 12345 Jan 5 12:00 filename.tar.gz
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 9) {
        const size = parseInt(parts[4], 10);
        const filename = parts[parts.length - 1].replace('/backups/', '');

        // Extract date from filename (format: name_YYYY-MM-DDTHH-MM-SS-mmmZ.tar.gz)
        const dateMatch = filename.match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/);
        const date = dateMatch
          ? new Date(dateMatch[1].replace(/-/g, (m, i) => i > 9 ? ':' : '-'))
          : new Date();

        backups.push({
          name: filename,
          size,
          date
        });
      }
    }

    // Sort by date, newest first
    return backups.sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  /**
   * Delete a backup
   * @param {string} filename - Backup filename to delete
   * @returns {Promise<{success: boolean}>}
   */
  async deleteBackup(filename) {
    await this._runHelper(
      ['rm', '-f', `/backups/${filename}`],
      [`${this.backupVolume}:/backups`]
    );

    return { success: true };
  }

  /**
   * Get total size of all backups
   * @returns {Promise<number>} Size in bytes
   */
  async getTotalBackupSize() {
    const backups = await this.listBackups();
    return backups.reduce((total, b) => total + b.size, 0);
  }
}

module.exports = { BackupHelper };
