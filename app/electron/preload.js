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
    onStatusChange: createEventHandler('docker:status-changed')
  },

  // === Server ===
  server: {
    start: () => ipcRenderer.invoke('server:start'),
    stop: () => ipcRenderer.invoke('server:stop'),
    restart: () => ipcRenderer.invoke('server:restart'),
    getStatus: () => ipcRenderer.invoke('server:status'),
    getInfo: () => ipcRenderer.invoke('server:info'),
    waitForReady: () => ipcRenderer.invoke('server:wait-ready'),
    onStatusChange: createEventHandler('server:status-changed')
  },

  // === Stats ===
  stats: {
    get: () => ipcRenderer.invoke('stats:get'),
    startPolling: (intervalMs) => ipcRenderer.invoke('stats:start-polling', intervalMs),
    stopPolling: () => ipcRenderer.invoke('stats:stop-polling'),
    onStats: createEventHandler('stats:update')
  },

  // === Config ===
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    getAll: () => ipcRenderer.invoke('config:get-all'),
    set: (key, value) => ipcRenderer.invoke('config:set', key, value),
    setMultiple: (updates) => ipcRenderer.invoke('config:set-multiple', updates),
    getSchema: () => ipcRenderer.invoke('config:schema'),
    getDefaults: () => ipcRenderer.invoke('config:defaults')
  },

  // === Console ===
  console: {
    sendCommand: (cmd) => ipcRenderer.invoke('console:command', cmd),
    getSnapshot: (lines) => ipcRenderer.invoke('console:snapshot', lines),
    startFollowing: () => ipcRenderer.invoke('console:start-follow'),
    stopFollowing: () => ipcRenderer.invoke('console:stop-follow'),
    getBuffer: () => ipcRenderer.invoke('console:buffer'),
    clearBuffer: () => ipcRenderer.invoke('console:clear-buffer'),
    onLog: createEventHandler('console:log')
  },

  // === Events Log ===
  events: {
    getRecent: (count) => ipcRenderer.invoke('events:recent', count),
    getByType: (type, count) => ipcRenderer.invoke('events:by-type', type, count),
    clear: () => ipcRenderer.invoke('events:clear')
  },

  // === App ===
  app: {
    getVersion: () => ipcRenderer.invoke('app:version'),
    getPaths: () => ipcRenderer.invoke('app:paths'),
    openFolder: (type) => ipcRenderer.invoke('app:open-folder', type),
    openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
    quit: () => ipcRenderer.invoke('app:quit')
  }
});

// Expose platform info
contextBridge.exposeInMainWorld('platform', {
  isWindows: process.platform === 'win32',
  isMac: process.platform === 'darwin',
  isLinux: process.platform === 'linux',
  arch: process.arch
});
