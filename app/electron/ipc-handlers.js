/**
 * IPC handlers - Bridge between renderer and core
 */

const { shell, app } = require('electron');
const path = require('path');

// Import core modules
const { Paths } = require('../core/paths');
const { DockerDetector, DockerState } = require('../core/docker/detector');
const { ComposeManager } = require('../core/docker/compose');
const { LogsManager } = require('../core/docker/logs');
const { StatsManager } = require('../core/docker/stats');
const { RconClient } = require('../core/rcon/client');
const { ReadinessChecker } = require('../core/server/readiness');
const { EventLogger, EventType } = require('../core/events/logger');
const { EnvManager } = require('../core/config/env-manager');
const { ConfigSchema, getSchema, getAllKeys, getAllDefaults } = require('../core/config/schema');

// === Rate Limiting ===

const rateLimiters = new Map();

function createRateLimiter(maxPerSecond = 5) {
  return {
    check(key) {
      const now = Date.now();
      const window = rateLimiters.get(key) || [];
      const recent = window.filter(t => now - t < 1000);

      if (recent.length >= maxPerSecond) {
        return false;
      }

      recent.push(now);
      rateLimiters.set(key, recent);
      return true;
    }
  };
}

const consoleLimiter = createRateLimiter(5);

// === Global State ===

let paths = null;
let dockerDetector = null;
let compose = null;
let logsManager = null;
let statsManager = null;
let rconClient = null;
let readinessChecker = null;
let eventLogger = null;
let envManager = null;
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

  // RCON client will be initialized when server starts
  rconClient = null;
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
      intervalMs: 2000
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
        pollIntervalMs: 3000
      });

      // Connect RCON when ready
      if (result.rconReady && rconClient && !rconClient.isConnected()) {
        try {
          await rconClient.connectWithRetry({ maxAttempts: 5 });
        } catch (error) {
          console.error('Failed to connect RCON:', error);
        }
      }

      // Broadcast running status when server is ready
      if (result.ready) {
        broadcastServerStatus('running');
      }

      await eventLogger.log(EventType.SERVER_READY, { startupTimeMs: result.startupTimeMs });
      return result;
    } catch (error) {
      console.error('Wait for ready failed:', error);
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

    // Sanitization
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(cmd)) {
      throw new Error('Command contains invalid characters');
    }

    // Check RCON connection
    if (!rconClient || !rconClient.isConnected()) {
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
      logsDir: paths.appLogsDir
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
}

module.exports = { setupIpcHandlers };
