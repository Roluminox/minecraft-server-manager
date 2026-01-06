/**
 * Backup Manager - High-level backup operations with retention policy
 */

const { BackupHelper } = require('./helper');
const EventEmitter = require('events');

class BackupManager extends EventEmitter {
  /**
   * @param {import('../docker/compose').ComposeManager} compose
   * @param {import('../paths').Paths} paths
   * @param {object} options
   * @param {number} options.maxBackups - Maximum number of backups to keep (default: 10)
   * @param {number} options.maxSizeMB - Maximum total size in MB (default: 5000 = 5GB)
   */
  constructor(compose, paths, options = {}) {
    super();
    this.compose = compose;
    this.paths = paths;
    this.helper = new BackupHelper(compose.docker, paths);
    this.maxBackups = options.maxBackups || 10;
    this.maxSizeMB = options.maxSizeMB || 5000;
    this.isRunning = false;
  }

  /**
   * Create a new backup
   * @param {string} name - Backup name (e.g., "manual", "auto", "pre-update")
   * @param {object} options
   * @param {boolean} options.stopServer - Stop server before backup (safer)
   * @param {boolean} options.applyRetention - Apply retention policy after backup
   * @returns {Promise<{success: boolean, filename: string, size: number}>}
   */
  async createBackup(name = 'backup', options = {}) {
    const { stopServer = false, applyRetention = true } = options;

    if (this.isRunning) {
      throw new Error('A backup operation is already running');
    }

    this.isRunning = true;
    this.emit('start', { type: 'backup', name });

    try {
      // Optionally stop server for consistency
      let wasRunning = false;
      if (stopServer) {
        wasRunning = await this.compose.isRunning();
        if (wasRunning) {
          this.emit('progress', { phase: 'stopping', message: 'Stopping server...' });
          await this.compose.down();
        }
      } else {
        // Save world before backup if server is running
        try {
          // This would need RCON - skip for now if not available
          this.emit('progress', { phase: 'saving', message: 'Saving world...' });
        } catch {
          // Ignore - server might not be running
        }
      }

      // Create backup
      const result = await this.helper.createBackup(name, {
        compress: true,
        onProgress: (progress) => this.emit('progress', progress),
      });

      // Restart server if we stopped it
      if (stopServer && wasRunning) {
        this.emit('progress', { phase: 'restarting', message: 'Restarting server...' });
        await this.compose.up();
      }

      // Apply retention policy
      if (applyRetention) {
        this.emit('progress', { phase: 'retention', message: 'Applying retention policy...' });
        await this.applyRetention();
      }

      this.emit('complete', { type: 'backup', ...result });
      return result;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Restore a backup
   * @param {string} filename - Backup filename
   * @param {object} options
   * @param {boolean} options.autoRestart - Restart server after restore
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async restoreBackup(filename, options = {}) {
    const { autoRestart = true } = options;

    if (this.isRunning) {
      throw new Error('A backup operation is already running');
    }

    this.isRunning = true;
    this.emit('start', { type: 'restore', filename });

    try {
      // Stop server first
      const wasRunning = await this.compose.isRunning();
      if (wasRunning) {
        this.emit('progress', { phase: 'stopping', message: 'Stopping server...' });
        await this.compose.down();
      }

      // Restore backup
      const result = await this.helper.restoreBackup(filename, {
        onProgress: (progress) => this.emit('progress', progress),
      });

      // Restart server
      if (autoRestart || wasRunning) {
        this.emit('progress', { phase: 'restarting', message: 'Restarting server...' });
        await this.compose.up();
      }

      this.emit('complete', { type: 'restore', ...result });
      return result;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * List all backups
   * @returns {Promise<{name: string, size: number, date: Date, sizeFormatted: string}[]>}
   */
  async listBackups() {
    const backups = await this.helper.listBackups();

    return backups.map((b) => ({
      ...b,
      sizeFormatted: this._formatSize(b.size),
    }));
  }

  /**
   * Delete a backup
   * @param {string} filename
   * @returns {Promise<{success: boolean}>}
   */
  async deleteBackup(filename) {
    return this.helper.deleteBackup(filename);
  }

  /**
   * Apply retention policy
   * Deletes old backups based on maxBackups and maxSizeMB
   * @returns {Promise<{deleted: string[]}>}
   */
  async applyRetention() {
    const backups = await this.helper.listBackups();
    const deleted = [];

    // Sort by date, oldest first for deletion
    const sortedBackups = [...backups].sort((a, b) => a.date.getTime() - b.date.getTime());

    // Delete excess backups (by count)
    while (sortedBackups.length > this.maxBackups) {
      const oldest = sortedBackups.shift();
      if (oldest) {
        await this.helper.deleteBackup(oldest.name);
        deleted.push(oldest.name);
      }
    }

    // Delete backups if total size exceeds limit
    let totalSize = sortedBackups.reduce((sum, b) => sum + b.size, 0);
    const maxSizeBytes = this.maxSizeMB * 1024 * 1024;

    while (totalSize > maxSizeBytes && sortedBackups.length > 1) {
      const oldest = sortedBackups.shift();
      if (oldest) {
        await this.helper.deleteBackup(oldest.name);
        deleted.push(oldest.name);
        totalSize -= oldest.size;
      }
    }

    return { deleted };
  }

  /**
   * Get backup statistics
   * @returns {Promise<{count: number, totalSize: number, totalSizeFormatted: string, oldestDate: Date|null, newestDate: Date|null}>}
   */
  async getStats() {
    const backups = await this.helper.listBackups();

    if (backups.length === 0) {
      return {
        count: 0,
        totalSize: 0,
        totalSizeFormatted: '0 B',
        oldestDate: null,
        newestDate: null,
      };
    }

    const totalSize = backups.reduce((sum, b) => sum + b.size, 0);
    const dates = backups.map((b) => b.date).sort((a, b) => a.getTime() - b.getTime());

    return {
      count: backups.length,
      totalSize,
      totalSizeFormatted: this._formatSize(totalSize),
      oldestDate: dates[0],
      newestDate: dates[dates.length - 1],
    };
  }

  /**
   * Format bytes to human readable
   * @param {number} bytes
   * @returns {string}
   */
  _formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  }
}

module.exports = { BackupManager };
