/**
 * Docker container logs management with EventEmitter
 * Supports snapshot mode (last N lines) and follow mode (real-time stream)
 */

const EventEmitter = require('events');

class LogsManager extends EventEmitter {
  /**
   * @param {import('./compose').ComposeManager} compose
   */
  constructor(compose) {
    super();
    this.compose = compose;
    this.buffer = [];
    this.maxBufferSize = 500;
    this.following = false;
    this.stream = null;
  }

  // === Snapshot Mode ===

  /**
   * Get last N lines of logs (snapshot mode)
   * @param {number} lines - Number of lines to retrieve
   * @returns {Promise<Array<{raw: string, timestamp: Date, level: string, thread: string|null, message: string}>>}
   */
  async getSnapshot(lines = 100) {
    const container = await this.compose.getContainer();

    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail: lines,
      timestamps: true
    });

    return this._parseLogBuffer(logs);
  }

  // === Follow Mode ===

  /**
   * Start following logs in real-time
   * Emits 'log' event for each new log line
   * Emits 'error' event on errors
   * Emits 'end' event when stream ends
   */
  async startFollowing() {
    if (this.following) return;

    const container = await this.compose.getContainer();

    this.stream = await container.logs({
      stdout: true,
      stderr: true,
      follow: true,
      tail: 50,
      timestamps: true
    });

    this.following = true;
    let lineBuffer = '';

    this.stream.on('data', (chunk) => {
      // Handle Docker stream header (8 bytes) if present
      let text = chunk.toString('utf8');

      // Docker multiplexed stream handling
      // First byte: stream type (1=stdout, 2=stderr)
      // Bytes 1-3: reserved
      // Bytes 4-7: payload size (big-endian)
      if (chunk.length > 8 && (chunk[0] === 1 || chunk[0] === 2)) {
        text = chunk.slice(8).toString('utf8');
      }

      lineBuffer += text;

      // Split by newlines and process complete lines
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop(); // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          const parsed = this._parseLine(trimmed);
          this._addToBuffer(parsed);
          this.emit('log', parsed);
        }
      }
    });

    this.stream.on('error', (error) => {
      this.emit('error', error);
    });

    this.stream.on('end', () => {
      this.following = false;
      this.stream = null;
      this.emit('end');
    });
  }

  /**
   * Stop following logs
   */
  stopFollowing() {
    if (this.stream) {
      this.stream.destroy();
      this.stream = null;
    }
    this.following = false;
  }

  /**
   * Check if currently following
   * @returns {boolean}
   */
  isFollowing() {
    return this.following;
  }

  // === Buffer Management ===

  /**
   * Add log entry to buffer
   * @param {object} log
   */
  _addToBuffer(log) {
    this.buffer.push(log);
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }
  }

  /**
   * Get current buffer contents
   * @returns {Array}
   */
  getBuffer() {
    return [...this.buffer];
  }

  /**
   * Clear buffer
   */
  clearBuffer() {
    this.buffer = [];
  }

  /**
   * Set buffer size
   * @param {number} size
   */
  setBufferSize(size) {
    this.maxBufferSize = size;
    while (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }
  }

  // === Parsing ===

  /**
   * Parse raw log buffer into structured entries
   * @param {Buffer} buffer
   * @returns {Array}
   */
  _parseLogBuffer(buffer) {
    let text = buffer.toString('utf8');

    // Handle Docker multiplexed stream
    const lines = [];
    let offset = 0;

    while (offset < buffer.length) {
      // Check for stream header
      if (buffer.length - offset >= 8 && (buffer[offset] === 1 || buffer[offset] === 2)) {
        const size = buffer.readUInt32BE(offset + 4);
        const content = buffer.slice(offset + 8, offset + 8 + size).toString('utf8');
        lines.push(...content.split('\n').filter(l => l.trim()));
        offset += 8 + size;
      } else {
        // No header, just parse rest as text
        text = buffer.slice(offset).toString('utf8');
        lines.push(...text.split('\n').filter(l => l.trim()));
        break;
      }
    }

    return lines.map(line => this._parseLine(line));
  }

  /**
   * Parse a single log line into structured format
   * @param {string} line
   * @returns {{raw: string, timestamp: Date, level: string, thread: string|null, message: string}}
   */
  _parseLine(line) {
    // Docker timestamp format: 2024-01-05T12:34:56.789012345Z
    const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\s*/);

    // Minecraft log level: [INFO], [WARN], [ERROR], [DEBUG]
    const levelMatch = line.match(/\[(INFO|WARN|ERROR|DEBUG|FATAL)\]/i);

    // Thread: [Server thread/INFO], [main/INFO], etc.
    const threadMatch = line.match(/\[([^\]\/]+)\/[^\]]+\]/);

    // Extract message (after the last ]: )
    const messageMatch = line.match(/\]:\s*(.*)$/);

    return {
      raw: line,
      timestamp: timestampMatch ? new Date(timestampMatch[1]) : new Date(),
      level: levelMatch ? levelMatch[1].toUpperCase() : 'INFO',
      thread: threadMatch ? threadMatch[1] : null,
      message: messageMatch ? messageMatch[1] : line
    };
  }

  // === Filtering ===

  /**
   * Filter logs by level
   * @param {Array} logs
   * @param {string|string[]} levels - Level(s) to include
   * @returns {Array}
   */
  filterByLevel(logs, levels) {
    const levelSet = new Set(Array.isArray(levels) ? levels : [levels]);
    return logs.filter(log => levelSet.has(log.level));
  }

  /**
   * Search logs by text
   * @param {Array} logs
   * @param {string} query
   * @param {boolean} caseSensitive
   * @returns {Array}
   */
  search(logs, query, caseSensitive = false) {
    const searchQuery = caseSensitive ? query : query.toLowerCase();
    return logs.filter(log => {
      const text = caseSensitive ? log.raw : log.raw.toLowerCase();
      return text.includes(searchQuery);
    });
  }
}

module.exports = { LogsManager };
