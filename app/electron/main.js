/**
 * Electron main process
 */

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { setupIpcHandlers } = require('./ipc-handlers');

// Keep a global reference of the window object
let mainWindow = null;

// Determine if we're in development mode
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

/**
 * Create the main application window
 */
function createWindow() {
  const windowConfig = {
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Minecraft Server Manager',
    webPreferences: {
      // Security: Enable context isolation
      contextIsolation: true,
      // Security: Disable node integration in renderer
      nodeIntegration: false,
      // Security: Enable sandbox
      sandbox: true,
      // Preload script for IPC
      preload: path.join(__dirname, 'preload.js'),
      // Security
      webSecurity: true,
      allowRunningInsecureContent: false
    },
    // Hide menu bar (show with Alt)
    autoHideMenuBar: true,
    // Show when ready
    show: false
  };

  mainWindow = new BrowserWindow(windowConfig);

  // Handle load errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
  });

  // Load the app
  if (isDev) {
    // Development: load from Vite dev server
    mainWindow.loadURL('http://localhost:5173');

    // Open DevTools in development
    mainWindow.webContents.openDevTools();
  } else {
    // Production: load from built files
    mainWindow.loadFile(path.join(__dirname, '../ui/dist/index.html'));
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Open external links in browser
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Initialize the application
 */
async function initialize() {
  // Create window first
  createWindow();

  // Setup IPC handlers with window reference for broadcasting
  setupIpcHandlers(ipcMain, mainWindow);
}

// App ready
app.whenReady().then(initialize);

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Re-create window on macOS when clicking dock icon
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Security: Prevent navigation to external URLs
app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (event, url) => {
    const parsedUrl = new URL(url);

    // Only allow localhost in dev or file:// in production
    if (isDev && parsedUrl.hostname === 'localhost') {
      return;
    }

    if (parsedUrl.protocol === 'file:') {
      return;
    }

    event.preventDefault();
  });
});

// Export for testing
module.exports = { createWindow };
