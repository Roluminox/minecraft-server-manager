/**
 * Docker container stats management
 * Provides real-time CPU/Memory/Network statistics with proper CPU% calculation
 */

const EventEmitter = require('events');

class StatsManager extends EventEmitter {
  /**
   * @param {import('./compose').ComposeManager} compose
   */
  constructor(compose) {
    super();
    this.compose = compose;
    this.polling = false;
    this.pollInterval = null;
    this.tickMs = 2000; // Default 2 seconds
  }

  // === Polling ===

  /**
   * Start polling stats at regular intervals
   * Emits 'stats' event with stats object
   * Emits 'error' event on errors
   * @param {number} intervalMs - Polling interval in milliseconds (default: 2000)
   */
  async startPolling(intervalMs = 2000) {
    if (this.polling) return;

    this.tickMs = intervalMs;
    this.polling = true;

    const poll = async () => {
      if (!this.polling) return;

      try {
        const stats = await this.getStats();
        this.emit('stats', stats);
      } catch (error) {
        this.emit('error', error);
      }
    };

    // First tick immediately
    await poll();

    // Then regular intervals
    this.pollInterval = setInterval(poll, this.tickMs);
  }

  /**
   * Stop polling stats
   */
  stopPolling() {
    this.polling = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Check if currently polling
   * @returns {boolean}
   */
  isPolling() {
    return this.polling;
  }

  // === Stats Retrieval ===

  /**
   * Get current stats snapshot
   * @returns {Promise<{cpu: object, memory: object, network: object, blockIO: object, timestamp: Date}>}
   */
  async getStats() {
    const container = await this.compose.getContainer();
    const rawStats = await container.stats({ stream: false });

    return {
      cpu: this._calculateCpu(rawStats),
      memory: this._calculateMemory(rawStats),
      network: this._calculateNetwork(rawStats),
      blockIO: this._calculateBlockIO(rawStats),
      pids: rawStats.pids_stats?.current || 0,
      timestamp: new Date()
    };
  }

  // === Calculations ===

  /**
   * Calculate CPU usage percentage using delta method
   * @param {object} stats - Raw Docker stats
   * @returns {{percent: number, cores: number, totalPercent: number}}
   */
  _calculateCpu(stats) {
    const cpuStats = stats.cpu_stats || {};
    const preCpuStats = stats.precpu_stats || {};

    // Get CPU usage delta
    const cpuDelta = (cpuStats.cpu_usage?.total_usage || 0) -
                     (preCpuStats.cpu_usage?.total_usage || 0);

    // Get system CPU usage delta
    const systemDelta = (cpuStats.system_cpu_usage || 0) -
                        (preCpuStats.system_cpu_usage || 0);

    // Number of CPUs
    const cpuCount = cpuStats.online_cpus ||
                     cpuStats.cpu_usage?.percpu_usage?.length ||
                     1;

    // Calculate percentage (normalized to 0-100%)
    let cpuPercent = 0;
    if (systemDelta > 0 && cpuDelta > 0) {
      // This gives percentage relative to total CPU capacity (all cores = 100%)
      cpuPercent = (cpuDelta / systemDelta) * 100;
    }

    return {
      percent: Math.round(cpuPercent * 10) / 10, // Normalized 0-100%
      cores: cpuCount,
      // Total across all cores (can exceed 100%)
      totalPercent: Math.round(cpuPercent * cpuCount * 10) / 10
    };
  }

  /**
   * Calculate memory usage
   * @param {object} stats - Raw Docker stats
   * @returns {{used: number, limit: number, usedMB: number, limitMB: number, percent: number, cache: number}}
   */
  _calculateMemory(stats) {
    const memStats = stats.memory_stats || {};

    const usage = memStats.usage || 0;
    const limit = memStats.limit || 0;
    const cache = memStats.stats?.cache || 0;

    // Real usage = usage - cache (cache can be reclaimed)
    const realUsage = usage - cache;

    return {
      used: realUsage,
      limit: limit,
      usedMB: Math.round(realUsage / 1024 / 1024),
      limitMB: Math.round(limit / 1024 / 1024),
      usedGB: Math.round(realUsage / 1024 / 1024 / 1024 * 10) / 10,
      limitGB: Math.round(limit / 1024 / 1024 / 1024 * 10) / 10,
      percent: limit > 0 ? Math.round((realUsage / limit) * 100) : 0,
      cache: cache,
      cacheMB: Math.round(cache / 1024 / 1024)
    };
  }

  /**
   * Calculate network I/O
   * @param {object} stats - Raw Docker stats
   * @returns {{rxBytes: number, txBytes: number, rxMB: number, txMB: number, interfaces: object}}
   */
  _calculateNetwork(stats) {
    const networks = stats.networks || {};

    let totalRx = 0;
    let totalTx = 0;
    const interfaces = {};

    for (const [name, net] of Object.entries(networks)) {
      const rx = net.rx_bytes || 0;
      const tx = net.tx_bytes || 0;
      totalRx += rx;
      totalTx += tx;

      interfaces[name] = {
        rxBytes: rx,
        txBytes: tx,
        rxMB: Math.round(rx / 1024 / 1024 * 10) / 10,
        txMB: Math.round(tx / 1024 / 1024 * 10) / 10,
        rxPackets: net.rx_packets || 0,
        txPackets: net.tx_packets || 0,
        rxErrors: net.rx_errors || 0,
        txErrors: net.tx_errors || 0
      };
    }

    return {
      rxBytes: totalRx,
      txBytes: totalTx,
      rxMB: Math.round(totalRx / 1024 / 1024 * 10) / 10,
      txMB: Math.round(totalTx / 1024 / 1024 * 10) / 10,
      interfaces
    };
  }

  /**
   * Calculate block I/O
   * @param {object} stats - Raw Docker stats
   * @returns {{read: number, write: number, readMB: number, writeMB: number}}
   */
  _calculateBlockIO(stats) {
    const blkioStats = stats.blkio_stats || {};
    const ioServiceBytes = blkioStats.io_service_bytes_recursive || [];

    let read = 0;
    let write = 0;

    for (const entry of ioServiceBytes) {
      if (entry.op === 'Read' || entry.op === 'read') {
        read += entry.value || 0;
      } else if (entry.op === 'Write' || entry.op === 'write') {
        write += entry.value || 0;
      }
    }

    return {
      read,
      write,
      readMB: Math.round(read / 1024 / 1024 * 10) / 10,
      writeMB: Math.round(write / 1024 / 1024 * 10) / 10
    };
  }

  // === Formatting Helpers ===

  /**
   * Format bytes to human readable string
   * @param {number} bytes
   * @returns {string}
   */
  static formatBytes(bytes) {
    if (bytes === 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));

    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  }

  /**
   * Format percentage
   * @param {number} percent
   * @returns {string}
   */
  static formatPercent(percent) {
    return `${percent.toFixed(1)}%`;
  }
}

module.exports = { StatsManager };
