/**
 * Electron preload script - Secure API bridge
 * Exposes only whitelisted functions to the renderer
 */

const { contextBridge, ipcRenderer } = require('electron');

// Create safe event listener wrapper
function createEventHandler(channel) {
  return (callback) => {
    const handler = (_, ...args) => callback(...args);
    ipcRenderer.on(channel, handler);

    // Return unsubscribe function
    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  };
}

// Expose protected API to renderer
contextBridge.exposeInMainWorld('api', {
  // === Docker ===
  docker: {
    getStatus: () => ipcRenderer.invoke('docker:status'),
    openDockerDesktop: () => ipcRenderer.invoke('docker:open-desktop'),
    waitUntilReady: () => ipcRenderer.invoke('docker:wait-ready'),
    onStatusChange: createEventHandler('docker:status-changed'),
  },

  // === Server ===
  server: {
    start: () => ipcRenderer.invoke('server:start'),
    stop: () => ipcRenderer.invoke('server:stop'),
    restart: () => ipcRenderer.invoke('server:restart'),
    getStatus: () => ipcRenderer.invoke('server:status'),
    getInfo: () => ipcRenderer.invoke('server:info'),
    waitForReady: () => ipcRenderer.invoke('server:wait-ready'),
    onStatusChange: createEventHandler('server:status-changed'),
  },

  // === Stats ===
  stats: {
    get: () => ipcRenderer.invoke('stats:get'),
    startPolling: (intervalMs) => ipcRenderer.invoke('stats:start-polling', intervalMs),
    stopPolling: () => ipcRenderer.invoke('stats:stop-polling'),
    onStats: createEventHandler('stats:update'),
  },

  // === Config ===
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    getAll: () => ipcRenderer.invoke('config:get-all'),
    set: (key, value) => ipcRenderer.invoke('config:set', key, value),
    setMultiple: (updates) => ipcRenderer.invoke('config:set-multiple', updates),
    getSchema: () => ipcRenderer.invoke('config:schema'),
    getDefaults: () => ipcRenderer.invoke('config:defaults'),
  },

  // === Console ===
  console: {
    sendCommand: (cmd) => ipcRenderer.invoke('console:command', cmd),
    getSnapshot: (lines) => ipcRenderer.invoke('console:snapshot', lines),
    startFollowing: () => ipcRenderer.invoke('console:start-follow'),
    stopFollowing: () => ipcRenderer.invoke('console:stop-follow'),
    getBuffer: () => ipcRenderer.invoke('console:buffer'),
    clearBuffer: () => ipcRenderer.invoke('console:clear-buffer'),
    onLog: createEventHandler('console:log'),
  },

  // === Events Log ===
  events: {
    getRecent: (count) => ipcRenderer.invoke('events:recent', count),
    getByType: (type, count) => ipcRenderer.invoke('events:by-type', type, count),
    clear: () => ipcRenderer.invoke('events:clear'),
  },

  // === App ===
  app: {
    getVersion: () => ipcRenderer.invoke('app:version'),
    getPaths: () => ipcRenderer.invoke('app:paths'),
    openFolder: (type) => ipcRenderer.invoke('app:open-folder', type),
    openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
    quit: () => ipcRenderer.invoke('app:quit'),
  },

  // === Players (V1) ===
  players: {
    list: () => ipcRenderer.invoke('players:list'),
    kick: (player, reason) => ipcRenderer.invoke('players:kick', player, reason),
    ban: (player, reason) => ipcRenderer.invoke('players:ban', player, reason),
    pardon: (player) => ipcRenderer.invoke('players:pardon', player),
    getBanList: () => ipcRenderer.invoke('players:banlist'),
  },

  // === Whitelist (V1) ===
  whitelist: {
    list: () => ipcRenderer.invoke('whitelist:list'),
    add: (player) => ipcRenderer.invoke('whitelist:add', player),
    remove: (player) => ipcRenderer.invoke('whitelist:remove', player),
    enable: () => ipcRenderer.invoke('whitelist:on'),
    disable: () => ipcRenderer.invoke('whitelist:off'),
    reload: () => ipcRenderer.invoke('whitelist:reload'),
  },

  // === Operators (V1) ===
  ops: {
    list: () => ipcRenderer.invoke('ops:list'),
    add: (player) => ipcRenderer.invoke('ops:add', player),
    remove: (player) => ipcRenderer.invoke('ops:remove', player),
  },

  // === Backups (V1) ===
  backup: {
    list: () => ipcRenderer.invoke('backup:list'),
    create: (name) => ipcRenderer.invoke('backup:create', name),
    restore: (filename) => ipcRenderer.invoke('backup:restore', filename),
    delete: (filename) => ipcRenderer.invoke('backup:delete', filename),
    getStats: () => ipcRenderer.invoke('backup:stats'),
    onProgress: createEventHandler('backup:progress'),
  },
});

// Expose platform info
contextBridge.exposeInMainWorld('platform', {
  isWindows: process.platform === 'win32',
  isMac: process.platform === 'darwin',
  isLinux: process.platform === 'linux',
  arch: process.arch,
});
