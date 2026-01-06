/**
 * IPC handlers - Bridge between renderer and core
 */

const { shell, app } = require('electron');
const path = require('path');

// Import core modules
const { loggers } = require('../core/utils/logger');
const log = loggers.ipc;
const { Paths } = require('../core/paths');
const { DockerDetector, DockerState } = require('../core/docker/detector');
const { ComposeManager } = require('../core/docker/compose');
const { LogsManager } = require('../core/docker/logs');
const { StatsManager } = require('../core/docker/stats');
const { RconClient } = require('../core/rcon/client');
const { RconCommands } = require('../core/rcon/commands');
const { ReadinessChecker } = require('../core/server/readiness');
const { EventLogger, EventType } = require('../core/events/logger');
const { EnvManager } = require('../core/config/env-manager');
const { ConfigSchema, getSchema, getAllKeys, getAllDefaults } = require('../core/config/schema');
const { BackupManager } = require('../core/backup/manager');

// === Rate Limiting ===

const rateLimiters = new Map();

function createRateLimiter(maxPerSecond = 5) {
  return {
    check(key) {
      const now = Date.now();
      const window = rateLimiters.get(key) || [];
      const recent = window.filter((t) => now - t < 1000);

      if (recent.length >= maxPerSecond) {
        return false;
      }

      recent.push(now);
      rateLimiters.set(key, recent);
      return true;
    },
  };
}

const consoleLimiter = createRateLimiter(5);

// === Container file readers (via docker exec) ===

const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);

/**
 * Read a file from inside the Docker container
 * @param {string} containerPath - Path inside container (e.g., /data/ops.json)
 * @returns {Promise<string>} File contents
 */
async function readContainerFile(containerPath) {
  try {
    // Use -u 1000 because /data belongs to minecraft user (UID 1000), not root
    const { stdout } = await execFileAsync('docker', [
      'exec',
      '-u',
      '1000',
      'minecraft-server',
      'cat',
      containerPath,
    ]);
    return stdout;
  } catch (error) {
    log.error({ path: containerPath, err: error }, 'Failed to read from container');
    return null;
  }
}

/**
 * Read ops.json from container
 * @returns {Promise<string[]>} List of operator names
 */
async function readOpsFromContainer() {
  const content = await readContainerFile('/data/ops.json');
  if (!content) return [];

  try {
    const ops = JSON.parse(content);
    return ops.map((op) => op.name).filter(Boolean);
  } catch (error) {
    log.error({ err: error }, 'Failed to parse ops.json');
    return [];
  }
}

/**
 * Read banned-players.json from container
 * @returns {Promise<string[]>} List of banned player names
 */
async function readBannedPlayersFromContainer() {
  const content = await readContainerFile('/data/banned-players.json');
  if (!content) return [];

  try {
    const banned = JSON.parse(content);
    return banned.map((player) => player.name).filter(Boolean);
  } catch (error) {
    log.error({ err: error }, 'Failed to parse banned-players.json');
    return [];
  }
}

// === Global State ===

let paths = null;
let dockerDetector = null;
let compose = null;
let logsManager = null;
let statsManager = null;
let rconClient = null;
let rconCommands = null;
let readinessChecker = null;
let eventLogger = null;
let envManager = null;
let backupManager = null;
let mainWindow = null;
let serverState = 'stopped'; // stopped, starting, running, stopping

/**
 * Broadcast server status change to renderer
 */
function broadcastServerStatus(status) {
  serverState = status;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('server:status-changed', status);
  }
}

let rconConnecting = false;

/**
 * Ensure RCON is connected (auto-connect if server is running)
 * @returns {Promise<boolean>} true if RCON is connected
 */
async function ensureRcon() {
  // Already connected
  if (rconClient?.isConnected()) {
    return true;
  }

  // Prevent concurrent connection attempts
  if (rconConnecting) {
    // Wait for ongoing connection
    await new Promise((resolve) => setTimeout(resolve, 500));
    return rconClient?.isConnected() || false;
  }

  rconConnecting = true;

  try {
    // Check if server is running
    const isRunning = await compose.isRunning();
    if (!isRunning) {
      log.debug('RCON: Server not running');
      return false;
    }

    // Create RCON client if needed
    if (!rconClient) {
      const rconPassword = await envManager.get('RCON_PASSWORD');
      if (!rconPassword) {
        log.error('RCON: Password not configured');
        return false;
      }
      log.debug('RCON: Creating client...');
      rconClient = new RconClient({ password: rconPassword });
      rconCommands = new RconCommands(rconClient);
    }

    // Try to connect
    log.info('RCON: Connecting to 127.0.0.1:25575...');
    await rconClient.connectWithRetry({ maxAttempts: 5, delayMs: 1000 });
    log.info('RCON: Connected successfully!');
    return true;
  } catch (error) {
    log.error({ err: error }, 'RCON: Failed to connect');
    // Reset client on failure
    rconClient = null;
    rconCommands = null;
    return false;
  } finally {
    rconConnecting = false;
  }
}

/**
 * Initialize core modules
 */
function initializeCore() {
  // Determine project root (parent of app folder)
  const projectRoot = path.resolve(__dirname, '../..');

  // Initialize paths
  paths = new Paths(projectRoot);

  // Initialize modules
  dockerDetector = new DockerDetector();
  compose = new ComposeManager(paths);
  logsManager = new LogsManager(compose);
  statsManager = new StatsManager(compose);
  eventLogger = new EventLogger(paths);
  envManager = new EnvManager(paths.envFile);
  backupManager = new BackupManager(compose, paths);

  // Wire up backup events to IPC
  backupManager.on('progress', (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('backup:progress', progress);
    }
  });

  // RCON client will be initialized when server starts
  rconClient = null;
  rconCommands = null;
  readinessChecker = new ReadinessChecker(compose);
}

/**
 * Setup IPC handlers
 * @param {Electron.IpcMain} ipcMain
 * @param {Electron.BrowserWindow} window - Main window for broadcasting events
 */
function setupIpcHandlers(ipcMain, window = null) {
  // Store window reference for broadcasting
  mainWindow = window;

  // Initialize core
  initializeCore();

  // === Docker Handlers ===

  ipcMain.handle('docker:status', async () => {
    return dockerDetector.detect();
  });

  ipcMain.handle('docker:open-desktop', async () => {
    await dockerDetector.openDockerDesktop();
    return { success: true };
  });

  ipcMain.handle('docker:wait-ready', async () => {
    return dockerDetector.waitUntilReady({
      maxAttempts: 30,
      intervalMs: 2000,
    });
  });

  // === Server Handlers ===

  ipcMain.handle('server:start', async () => {
    broadcastServerStatus('starting');
    await eventLogger.log(EventType.SERVER_START);

    try {
      const result = await compose.up();

      // Initialize RCON after server starts
      const rconPassword = await envManager.get('RCON_PASSWORD');
      if (rconPassword) {
        rconClient = new RconClient({ password: rconPassword });
        rconCommands = new RconCommands(rconClient);
      }

      return result;
    } catch (error) {
      broadcastServerStatus('stopped');
      throw error;
    }
  });

  ipcMain.handle('server:stop', async () => {
    broadcastServerStatus('stopping');

    // Disconnect RCON
    if (rconClient) {
      await rconClient.disconnect();
      rconClient = null;
      rconCommands = null;
    }

    // Stop logs and stats
    logsManager.stopFollowing();
    statsManager.stopPolling();

    await eventLogger.log(EventType.SERVER_STOP);
    const result = await compose.down();
    broadcastServerStatus('stopped');
    return result;
  });

  ipcMain.handle('server:restart', async () => {
    await eventLogger.log(EventType.SERVER_RESTART);

    if (rconClient) {
      await rconClient.disconnect();
    }

    logsManager.stopFollowing();
    statsManager.stopPolling();

    await compose.restart();

    // Re-initialize RCON
    const rconPassword = await envManager.get('RCON_PASSWORD');
    if (rconPassword) {
      rconClient = new RconClient({ password: rconPassword });
      rconCommands = new RconCommands(rconClient);
    }

    return { success: true };
  });

  ipcMain.handle('server:status', async () => {
    // Check actual container status
    const isRunning = await compose.isRunning();

    // If container is running and we're still in "starting" state, check if ready
    if (isRunning && serverState === 'starting') {
      try {
        const status = await readinessChecker.checkStatus();
        if (status.fullyReady) {
          broadcastServerStatus('running');
        }
      } catch {
        // Ignore errors, keep starting state
      }
    } else if (isRunning && serverState !== 'running' && serverState !== 'starting') {
      serverState = 'running';
    } else if (!isRunning && serverState !== 'stopped') {
      serverState = 'stopped';
    }

    return { isRunning, state: serverState };
  });

  ipcMain.handle('server:info', async () => {
    return compose.getContainerInfo();
  });

  ipcMain.handle('server:wait-ready', async () => {
    try {
      const result = await readinessChecker.waitForReady({
        timeoutMs: 180000, // 3 minutes max
        pollIntervalMs: 3000,
      });

      // Connect RCON when ready
      if (result.rconReady && rconClient && !rconClient.isConnected()) {
        try {
          await rconClient.connectWithRetry({ maxAttempts: 5 });
        } catch (error) {
          log.error({ err: error }, 'Failed to connect RCON');
        }
      }

      // Broadcast running status when server is ready
      if (result.ready) {
        broadcastServerStatus('running');
      }

      await eventLogger.log(EventType.SERVER_READY, { startupTimeMs: result.startupTimeMs });
      return result;
    } catch (error) {
      log.error({ err: error }, 'Wait for ready failed');
      // Still try to set running if container is actually running
      const isRunning = await compose.isRunning();
      if (isRunning) {
        broadcastServerStatus('running');
        return { ready: true, rconReady: false, startupTimeMs: 0, error: error.message };
      }
      throw error;
    }
  });

  // === Stats Handlers ===

  ipcMain.handle('stats:get', async () => {
    return statsManager.getStats();
  });

  ipcMain.handle('stats:start-polling', async (event, intervalMs = 2000) => {
    statsManager.on('stats', (stats) => {
      event.sender.send('stats:update', stats);
    });
    await statsManager.startPolling(intervalMs);
    return { success: true };
  });

  ipcMain.handle('stats:stop-polling', async () => {
    statsManager.stopPolling();
    statsManager.removeAllListeners('stats');
    return { success: true };
  });

  // === Config Handlers ===

  ipcMain.handle('config:get', async (event, key) => {
    return envManager.get(key);
  });

  ipcMain.handle('config:get-all', async () => {
    return envManager.read();
  });

  ipcMain.handle('config:set', async (event, key, value) => {
    const schema = getSchema(key);
    if (!schema) {
      throw new Error(`Unknown config key: ${key}`);
    }

    if (schema.validate && !schema.validate(value)) {
      throw new Error(`Invalid value for ${key}`);
    }

    const oldValue = await envManager.get(key);
    await envManager.set(schema.envVar || key, value);
    await eventLogger.logConfigChange(key, oldValue, value);

    return { success: true, requiresRestart: schema.requiresRestart };
  });

  ipcMain.handle('config:set-multiple', async (event, updates) => {
    const envUpdates = {};
    let requiresRestart = false;

    for (const [key, value] of Object.entries(updates)) {
      const schema = getSchema(key);
      if (!schema) {
        throw new Error(`Unknown config key: ${key}`);
      }

      if (schema.validate && !schema.validate(value)) {
        throw new Error(`Invalid value for ${key}`);
      }

      envUpdates[schema.envVar || key] = value;
      if (schema.requiresRestart) {
        requiresRestart = true;
      }

      // Auto-sync Docker memory limit when JVM memory changes
      // MC_MEM_LIMIT should be MC_MEMORY + 2G for OS/GC overhead
      if (key === 'mc.memory') {
        const memoryGB = parseInt(value);
        if (!isNaN(memoryGB)) {
          envUpdates['MC_MEM_LIMIT'] = `${memoryGB + 2}G`;
        }
      }
    }

    await envManager.setMultiple(envUpdates);
    return { success: true, requiresRestart };
  });

  ipcMain.handle('config:schema', async () => {
    // Filter out functions (validate, format, parse) that can't be cloned via IPC
    const serializableSchema = {};
    for (const [key, value] of Object.entries(ConfigSchema)) {
      serializableSchema[key] = {};
      for (const [prop, propValue] of Object.entries(value)) {
        if (typeof propValue !== 'function') {
          serializableSchema[key][prop] = propValue;
        }
      }
    }
    return serializableSchema;
  });

  ipcMain.handle('config:defaults', async () => {
    return getAllDefaults();
  });

  // === Console Handlers ===

  ipcMain.handle('console:command', async (event, cmd) => {
    // Rate limiting
    if (!consoleLimiter.check('console')) {
      throw new Error('Rate limit exceeded (max 5 commands/sec)');
    }

    // Validation
    if (typeof cmd !== 'string') {
      throw new Error('Command must be a string');
    }

    if (cmd.length === 0) {
      throw new Error('Command cannot be empty');
    }

    if (cmd.length > 200) {
      throw new Error('Command too long (max 200 chars)');
    }

    // Sanitization - check for control characters
    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(cmd)) {
      throw new Error('Command contains invalid characters');
    }

    // Auto-connect RCON if needed
    const connected = await ensureRcon();
    if (!connected) {
      throw new Error('RCON not connected. Is the server running?');
    }

    // Log command
    await eventLogger.logRconCommand(cmd, 'console');

    // Execute
    return rconClient.send(cmd);
  });

  ipcMain.handle('console:snapshot', async (event, lines = 100) => {
    return logsManager.getSnapshot(lines);
  });

  ipcMain.handle('console:start-follow', async (event) => {
    // Remove any existing listeners to prevent duplicates
    logsManager.removeAllListeners('log');

    logsManager.on('log', (log) => {
      event.sender.send('console:log', log);
    });
    await logsManager.startFollowing();
    return { success: true };
  });

  ipcMain.handle('console:stop-follow', async () => {
    logsManager.stopFollowing();
    logsManager.removeAllListeners('log');
    return { success: true };
  });

  ipcMain.handle('console:buffer', async () => {
    return logsManager.getBuffer();
  });

  ipcMain.handle('console:clear-buffer', async () => {
    logsManager.clearBuffer();
    return { success: true };
  });

  // === Events Handlers ===

  ipcMain.handle('events:recent', async (event, count = 50) => {
    return eventLogger.getRecent(count);
  });

  ipcMain.handle('events:by-type', async (event, type, count = 50) => {
    return eventLogger.getByType(type, count);
  });

  ipcMain.handle('events:clear', async () => {
    await eventLogger.clear();
    return { success: true };
  });

  // === App Handlers ===

  ipcMain.handle('app:version', async () => {
    return app.getVersion();
  });

  ipcMain.handle('app:paths', async () => {
    return {
      projectRoot: paths.projectRoot,
      dataDir: paths.dataDir,
      backupsDir: paths.backupsDir,
      logsDir: paths.appLogsDir,
    };
  });

  ipcMain.handle('app:open-folder', async (event, type) => {
    let folderPath;

    switch (type) {
      case 'project':
        folderPath = paths.projectRoot;
        break;
      case 'data':
        folderPath = paths.dataDir;
        break;
      case 'backups':
        folderPath = paths.backupsDir;
        break;
      case 'logs':
        folderPath = paths.appLogsDir;
        break;
      default:
        throw new Error(`Unknown folder type: ${type}`);
    }

    await shell.openPath(folderPath);
    return { success: true, path: folderPath };
  });

  ipcMain.handle('app:open-external', async (event, url) => {
    // Validate URL
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Only HTTP/HTTPS URLs allowed');
      }
    } catch {
      throw new Error('Invalid URL');
    }

    await shell.openExternal(url);
    return { success: true };
  });

  ipcMain.handle('app:quit', async () => {
    app.quit();
  });

  ipcMain.handle('app:network-ips', async () => {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    const ips = [];

    for (const [name, addrs] of Object.entries(interfaces)) {
      for (const addr of addrs) {
        // Skip internal (loopback) and IPv6
        if (addr.internal || addr.family !== 'IPv4') continue;

        // Detect Tailscale (usually 100.x.x.x range)
        const isTailscale =
          name.toLowerCase().includes('tailscale') || addr.address.startsWith('100.');

        ips.push({
          name,
          address: addr.address,
          isTailscale,
        });
      }
    }

    // Sort: Tailscale first, then by name
    ips.sort((a, b) => {
      if (a.isTailscale && !b.isTailscale) return -1;
      if (!a.isTailscale && b.isTailscale) return 1;
      return a.name.localeCompare(b.name);
    });

    return ips;
  });

  // === Players Handlers ===

  ipcMain.handle('players:list', async () => {
    const connected = await ensureRcon();
    if (!connected) {
      return { online: 0, max: 0, players: [] };
    }
    return rconCommands.listPlayers();
  });

  ipcMain.handle('players:kick', async (event, player, reason) => {
    const connected = await ensureRcon();
    if (!connected) {
      throw new Error('RCON not connected. Is the server running?');
    }
    return rconCommands.kick(player, reason);
  });

  ipcMain.handle('players:ban', async (event, player, reason) => {
    const connected = await ensureRcon();
    if (!connected) {
      throw new Error('RCON not connected. Is the server running?');
    }
    const result = await rconCommands.ban(player, reason);
    // Wait for server to write banned-players.json
    await new Promise((r) => setTimeout(r, 500));
    return result;
  });

  ipcMain.handle('players:pardon', async (event, player) => {
    const connected = await ensureRcon();
    if (!connected) {
      throw new Error('RCON not connected. Is the server running?');
    }
    const result = await rconCommands.pardon(player);
    // Wait for server to write banned-players.json
    await new Promise((r) => setTimeout(r, 500));
    return result;
  });

  ipcMain.handle('players:banlist', async () => {
    // Read directly from banned-players.json in container
    return readBannedPlayersFromContainer();
  });

  // === Whitelist Handlers ===

  ipcMain.handle('whitelist:list', async () => {
    const connected = await ensureRcon();
    if (!connected) {
      return { enabled: true, players: [] };
    }
    return rconCommands.getWhitelist();
  });

  ipcMain.handle('whitelist:add', async (event, player) => {
    const connected = await ensureRcon();
    if (!connected) {
      throw new Error('RCON not connected. Is the server running?');
    }
    return rconCommands.whitelistAdd(player);
  });

  ipcMain.handle('whitelist:remove', async (event, player) => {
    const connected = await ensureRcon();
    if (!connected) {
      throw new Error('RCON not connected. Is the server running?');
    }
    return rconCommands.whitelistRemove(player);
  });

  ipcMain.handle('whitelist:on', async () => {
    const connected = await ensureRcon();
    if (!connected) {
      throw new Error('RCON not connected. Is the server running?');
    }
    return rconCommands.whitelistOn();
  });

  ipcMain.handle('whitelist:off', async () => {
    const connected = await ensureRcon();
    if (!connected) {
      throw new Error('RCON not connected. Is the server running?');
    }
    return rconCommands.whitelistOff();
  });

  ipcMain.handle('whitelist:reload', async () => {
    const connected = await ensureRcon();
    if (!connected) {
      throw new Error('RCON not connected. Is the server running?');
    }
    return rconCommands.whitelistReload();
  });

  // === Operators Handlers ===

  ipcMain.handle('ops:list', async () => {
    // Read directly from ops.json in container (RCON 'op list' doesn't exist in vanilla)
    return readOpsFromContainer();
  });

  ipcMain.handle('ops:add', async (event, player) => {
    const connected = await ensureRcon();
    if (!connected) {
      throw new Error('RCON not connected. Is the server running?');
    }
    const result = await rconCommands.opAdd(player);
    // Wait for server to write ops.json
    await new Promise((r) => setTimeout(r, 500));
    return result;
  });

  ipcMain.handle('ops:remove', async (event, player) => {
    const connected = await ensureRcon();
    if (!connected) {
      throw new Error('RCON not connected. Is the server running?');
    }
    const result = await rconCommands.opRemove(player);
    // Wait for server to write ops.json
    await new Promise((r) => setTimeout(r, 500));
    return result;
  });

  // === Backup Handlers ===

  ipcMain.handle('backup:list', async () => {
    return backupManager.listBackups();
  });

  ipcMain.handle('backup:create', async (event, name = 'manual') => {
    return backupManager.createBackup(name, { applyRetention: true });
  });

  ipcMain.handle('backup:restore', async (event, filename) => {
    return backupManager.restoreBackup(filename);
  });

  ipcMain.handle('backup:delete', async (event, filename) => {
    return backupManager.deleteBackup(filename);
  });

  ipcMain.handle('backup:stats', async () => {
    return backupManager.getStats();
  });
}

module.exports = { setupIpcHandlers };
