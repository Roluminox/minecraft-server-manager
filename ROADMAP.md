# Roadmap - Minecraft Server Manager

## Vue d'ensemble des versions

| Version | Scope | Objectif |
|---------|-------|----------|
| **V0** | MVP Dashboard | Controle serveur fonctionnel |
| **V1** | Players + Backups | Gestion complete des joueurs et sauvegardes |
| **V2** | Mods + Automation | Extensibilite et automatisation |

---

# V0 - MVP Dashboard

**Objectif** : Application Electron fonctionnelle permettant de gerer un serveur Minecraft via Docker.

## Structure de fichiers V0

```
C:\Dev\Minecraft\
├── app/
│   ├── core/                     # LIB NODE PURE
│   │   ├── package.json
│   │   ├── index.js              # Export public
│   │   ├── paths.js              # CENTRALISATION CHEMINS
│   │   ├── docker/
│   │   │   ├── client.js         # Connexion dockerode + ping
│   │   │   ├── detector.js       # Detection etat Docker
│   │   │   ├── compose.js        # Up/down/restart via CLI spawn
│   │   │   ├── logs.js           # Stream logs + EventEmitter
│   │   │   └── stats.js          # CPU/RAM temps reel (delta)
│   │   ├── config/
│   │   │   ├── env-manager.js    # Lecture/ecriture .env
│   │   │   └── schema.js         # Validation (6-8 params)
│   │   ├── rcon/
│   │   │   └── client.js         # RCON avec reconnect auto
│   │   ├── server/
│   │   │   └── readiness.js      # Check port + log "Done"
│   │   ├── events/
│   │   │   └── logger.js         # Events log minimal
│   │   └── utils/
│   │       ├── retry.js          # Backoff exponentiel
│   │       └── logger.js         # Logging structure
│   │
│   ├── electron/
│   │   ├── main.js               # Window + IPC handlers
│   │   ├── preload.js            # API blanche securisee
│   │   └── ipc-handlers.js       # Bridge vers core/
│   │
│   └── ui/
│       ├── package.json
│       ├── src/
│       │   ├── App.jsx
│       │   ├── components/
│       │   │   ├── DockerStatus.jsx
│       │   │   ├── ServerControls.jsx
│       │   │   ├── ServerStats.jsx
│       │   │   ├── Console.jsx
│       │   │   └── ConfigPanel.jsx
│       │   └── hooks/
│       │       └── useServerStatus.js
│       └── ...
```

## Decisions techniques critiques

### 1. Compose via CLI (pas dockerode natif)

**Probleme** : dockerode ne gere pas Docker Compose nativement.

**Solution** : `compose.js` utilise `spawn("docker", ["compose", ...])` + resolution container ID.

```javascript
// core/docker/compose.js

const { spawn } = require('child_process');
const Docker = require('dockerode');

class ComposeManager {
  constructor(paths) {
    this.paths = paths;
    this.docker = new Docker();
    this.projectName = 'minecraft-server';  // ou detecte depuis docker-compose.yml
  }

  // === Compose via CLI ===
  async up(options = {}) {
    const args = ['compose', '-f', this.paths.composeFile, 'up', '-d'];
    if (options.build) args.push('--build');
    if (options.forceRecreate) args.push('--force-recreate');

    return this._exec(args);
  }

  async down(options = {}) {
    const args = ['compose', '-f', this.paths.composeFile, 'down'];
    if (options.removeVolumes) args.push('-v');

    return this._exec(args);
  }

  async restart() {
    await this.down();
    return this.up();
  }

  // === Resolution container ID (pour logs/stats via dockerode) ===
  async getServiceContainerId(serviceName = 'minecraft') {
    const containers = await this.docker.listContainers({
      all: true,
      filters: {
        label: [`com.docker.compose.project=${this.projectName}`],
        name: [serviceName]
      }
    });

    if (containers.length === 0) {
      throw new Error(`Container for service '${serviceName}' not found`);
    }

    return containers[0].Id;
  }

  async getContainer(serviceName = 'minecraft') {
    const id = await this.getServiceContainerId(serviceName);
    return this.docker.getContainer(id);
  }

  // === Execution CLI ===
  _exec(args) {
    return new Promise((resolve, reject) => {
      const proc = spawn('docker', args, {
        cwd: this.paths.projectRoot,
        env: { ...process.env }
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => { stdout += data; });
      proc.stderr.on('data', (data) => { stderr += data; });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr, code });
        } else {
          reject(new Error(`docker compose failed (code ${code}): ${stderr}`));
        }
      });

      proc.on('error', reject);
    });
  }
}

module.exports = { ComposeManager };
```

### 2. Chemins centralises (paths.js)

```javascript
// core/paths.js

const path = require('path');
const os = require('os');

class Paths {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
  }

  // === Fichiers projet ===
  get envFile() {
    return path.join(this.projectRoot, '.env');
  }

  get composeFile() {
    return path.join(this.projectRoot, 'docker-compose.yml');
  }

  // === Volume data (monte depuis host) ===
  get dataDir() {
    return path.join(this.projectRoot, 'data');
  }

  get serverProperties() {
    return path.join(this.dataDir, 'server.properties');
  }

  get whitelistFile() {
    return path.join(this.dataDir, 'whitelist.json');
  }

  get opsFile() {
    return path.join(this.dataDir, 'ops.json');
  }

  // === Backups ===
  get backupsDir() {
    return path.join(this.projectRoot, 'backups');
  }

  // === Logs applicatifs ===
  get appLogsDir() {
    return path.join(this.projectRoot, 'logs');
  }

  get eventsLogFile() {
    return path.join(this.appLogsDir, 'events.log');
  }

  // === Chemins containers (pour docker exec) ===
  static container = {
    data: '/data',
    world: '/data/world',
    mods: '/data/mods',
    plugins: '/data/plugins',
    backups: '/backups'
  };
}

module.exports = { Paths };
```

### 3. Detection Docker - Etats + Actions

```javascript
// core/docker/detector.js

const { exec } = require('child_process');
const Docker = require('dockerode');

const DockerState = {
  NOT_INSTALLED: 'not_installed',
  DAEMON_OFF: 'daemon_off',
  DAEMON_STARTING: 'daemon_starting',
  DAEMON_READY: 'daemon_ready',
  WSL2_ERROR: 'wsl2_error',
  PERMISSION_DENIED: 'permission_denied',
  UNKNOWN_ERROR: 'unknown_error'
};

const NextAction = {
  INSTALL_DOCKER: 'install_docker',
  OPEN_DOCKER_DESKTOP: 'open_docker_desktop',
  WAIT: 'wait',
  CHECK_WSL2: 'check_wsl2',
  CHECK_PERMISSIONS: 'check_permissions',
  NONE: 'none'
};

class DockerDetector {
  constructor() {
    this.docker = new Docker();
  }

  async detect() {
    // 1. Verifier installation CLI
    const cliInstalled = await this._checkCli();
    if (!cliInstalled) {
      return {
        state: DockerState.NOT_INSTALLED,
        message: 'Docker n\'est pas installe sur ce systeme',
        nextAction: NextAction.INSTALL_DOCKER,
        details: { downloadUrl: 'https://docs.docker.com/desktop/install/windows-install/' }
      };
    }

    // 2. Ping daemon via socket
    try {
      await this.docker.ping();
      const info = await this.docker.info();

      return {
        state: DockerState.DAEMON_READY,
        message: 'Docker daemon pret',
        nextAction: NextAction.NONE,
        details: {
          version: info.ServerVersion,
          containers: info.ContainersRunning,
          os: info.OperatingSystem
        }
      };
    } catch (error) {
      return this._analyzeError(error);
    }
  }

  _analyzeError(error) {
    const msg = error.message || '';

    // ECONNREFUSED = daemon pas demarre
    if (error.code === 'ECONNREFUSED' || msg.includes('ECONNREFUSED')) {
      return {
        state: DockerState.DAEMON_OFF,
        message: 'Docker Desktop n\'est pas demarre',
        nextAction: NextAction.OPEN_DOCKER_DESKTOP,
        details: { error: 'Connection refused' }
      };
    }

    // EACCES/EPERM = permissions
    if (error.code === 'EACCES' || error.code === 'EPERM') {
      return {
        state: DockerState.PERMISSION_DENIED,
        message: 'Permission refusee pour acceder au daemon Docker',
        nextAction: NextAction.CHECK_PERMISSIONS,
        details: { error: error.message }
      };
    }

    // WSL2 errors
    if (msg.includes('WSL') || msg.includes('wsl')) {
      return {
        state: DockerState.WSL2_ERROR,
        message: 'Probleme avec WSL2 backend',
        nextAction: NextAction.CHECK_WSL2,
        details: { error: error.message }
      };
    }

    // Erreur inconnue
    return {
      state: DockerState.UNKNOWN_ERROR,
      message: 'Erreur Docker inconnue',
      nextAction: NextAction.OPEN_DOCKER_DESKTOP,
      details: { error: error.message }
    };
  }

  async _checkCli() {
    return new Promise((resolve) => {
      exec('docker --version', (error) => {
        resolve(!error);
      });
    });
  }

  // === Actions ===
  async openDockerDesktop() {
    // Windows: ouvrir Docker Desktop
    const { exec } = require('child_process');
    return new Promise((resolve, reject) => {
      exec('start "" "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe"', (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  async waitUntilReady(options = {}) {
    const {
      maxAttempts = 30,
      intervalMs = 2000,
      onAttempt = () => {}
    } = options;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      onAttempt({ attempt, maxAttempts });

      const result = await this.detect();
      if (result.state === DockerState.DAEMON_READY) {
        return result;
      }

      await new Promise(r => setTimeout(r, intervalMs));
    }

    throw new Error('Docker daemon not ready after max attempts');
  }
}

module.exports = { DockerDetector, DockerState, NextAction };
```

### 4. RCON Client robuste

```javascript
// core/rcon/client.js

const { Rcon } = require('rcon-client');
const EventEmitter = require('events');

class RconClient extends EventEmitter {
  constructor(config) {
    super();
    this.config = {
      host: config.host || 'localhost',
      port: config.port || 25575,
      password: config.password,
      timeout: config.timeout || 5000
    };
    this.client = null;
    this.connected = false;
    this.reconnecting = false;
    this.queue = [];
    this.processing = false;

    // Heartbeat
    this.heartbeatInterval = null;
    this.heartbeatMs = 30000;  // 30s
  }

  // === Connexion avec retry ===
  async connectWithRetry(options = {}) {
    const {
      maxAttempts = 10,
      initialDelay = 2000,
      maxDelay = 30000,
      backoffFactor = 1.5,
      onAttempt = () => {}
    } = options;

    let delay = initialDelay;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      onAttempt({ attempt, maxAttempts, nextDelayMs: delay });

      try {
        await this.connect();
        return;
      } catch (error) {
        if (attempt === maxAttempts) {
          throw new Error(`RCON connection failed after ${maxAttempts} attempts: ${error.message}`);
        }

        await new Promise(r => setTimeout(r, delay));
        delay = Math.min(delay * backoffFactor, maxDelay);
      }
    }
  }

  async connect() {
    if (this.connected) return;

    this.client = await Rcon.connect(this.config);
    this.connected = true;
    this.emit('connected');

    // Setup disconnect handler
    this.client.on('end', () => this._handleDisconnect());

    // Start heartbeat
    this._startHeartbeat();
  }

  // === Auto-reconnect ===
  _handleDisconnect() {
    this.connected = false;
    this._stopHeartbeat();
    this.emit('disconnected');

    if (!this.reconnecting) {
      this._autoReconnect();
    }
  }

  async _autoReconnect() {
    this.reconnecting = true;
    this.emit('reconnecting');

    try {
      await this.connectWithRetry({
        maxAttempts: 5,
        initialDelay: 5000,
        onAttempt: (info) => this.emit('reconnect-attempt', info)
      });
      this.reconnecting = false;
      this.emit('reconnected');
    } catch (error) {
      this.reconnecting = false;
      this.emit('reconnect-failed', error);
    }
  }

  // === Heartbeat ===
  _startHeartbeat() {
    this.heartbeatInterval = setInterval(async () => {
      try {
        await this.send('list');  // Commande legere
      } catch (error) {
        // La deconnexion sera geree par l'event 'end'
      }
    }, this.heartbeatMs);
  }

  _stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // === Queue de commandes ===
  async send(command) {
    return new Promise((resolve, reject) => {
      this.queue.push({ command, resolve, reject });
      this._processQueue();
    });
  }

  async _processQueue() {
    if (this.processing || this.queue.length === 0) return;
    if (!this.connected) {
      // Attendre reconnexion ou rejeter
      const queued = this.queue.shift();
      queued.reject(new Error('RCON not connected'));
      return;
    }

    this.processing = true;
    const { command, resolve, reject } = this.queue.shift();

    try {
      const response = await this.client.send(command);
      resolve(response);
    } catch (error) {
      reject(error);
    } finally {
      this.processing = false;
      // Traiter le suivant
      if (this.queue.length > 0) {
        setImmediate(() => this._processQueue());
      }
    }
  }

  // === Cleanup ===
  async disconnect() {
    this._stopHeartbeat();
    if (this.client) {
      await this.client.end();
      this.client = null;
    }
    this.connected = false;
    this.queue = [];
  }
}

module.exports = { RconClient };
```

### 5. Logs avec EventEmitter + modes

```javascript
// core/docker/logs.js

const EventEmitter = require('events');

class LogsManager extends EventEmitter {
  constructor(compose) {
    super();
    this.compose = compose;
    this.buffer = [];
    this.maxBufferSize = 500;
    this.following = false;
    this.logProcess = null;
  }

  // === Mode snapshot (dernieres N lignes) ===
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

  // === Mode follow (stream temps reel) ===
  async startFollowing() {
    if (this.following) return;

    const container = await this.compose.getContainer();
    const stream = await container.logs({
      stdout: true,
      stderr: true,
      follow: true,
      tail: 50,
      timestamps: true
    });

    this.following = true;
    this.logProcess = stream;

    let lineBuffer = '';

    stream.on('data', (chunk) => {
      // Decoder et decouper par lignes
      const text = chunk.toString('utf8');
      lineBuffer += text;

      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop();  // Garder le fragment incomplet

      for (const line of lines) {
        if (line.trim()) {
          const parsed = this._parseLine(line);
          this._addToBuffer(parsed);
          this.emit('log', parsed);
        }
      }
    });

    stream.on('error', (error) => {
      this.emit('error', error);
    });

    stream.on('end', () => {
      this.following = false;
      this.emit('end');
    });
  }

  stopFollowing() {
    if (this.logProcess) {
      this.logProcess.destroy();
      this.logProcess = null;
    }
    this.following = false;
  }

  // === Buffer ===
  _addToBuffer(log) {
    this.buffer.push(log);
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }
  }

  getBuffer() {
    return [...this.buffer];
  }

  clearBuffer() {
    this.buffer = [];
  }

  // === Parsing ===
  _parseLogBuffer(buffer) {
    const text = buffer.toString('utf8');
    return text.split('\n')
      .filter(line => line.trim())
      .map(line => this._parseLine(line));
  }

  _parseLine(line) {
    // Format: [timestamp] [thread/level]: message
    const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\s*/);
    const levelMatch = line.match(/\[(INFO|WARN|ERROR|DEBUG)\]/i);
    const threadMatch = line.match(/\[([^\]]+thread[^\]]*)\]/i);

    return {
      raw: line,
      timestamp: timestampMatch ? new Date(timestampMatch[1]) : new Date(),
      level: levelMatch ? levelMatch[1].toUpperCase() : 'INFO',
      thread: threadMatch ? threadMatch[1] : null,
      message: line.replace(/^.*?\]:\s*/, '')  // Simplification
    };
  }
}

module.exports = { LogsManager };
```

### 6. Stats avec CPU% delta

```javascript
// core/docker/stats.js

const EventEmitter = require('events');

class StatsManager extends EventEmitter {
  constructor(compose) {
    super();
    this.compose = compose;
    this.polling = false;
    this.pollInterval = null;
    this.previousCpu = null;
    this.previousSystem = null;
    this.tickMs = 2000;  // 2s par defaut
  }

  // === Polling stats ===
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

    // Premier tick immediat
    await poll();

    // Puis intervalle regulier
    this.pollInterval = setInterval(poll, this.tickMs);
  }

  stopPolling() {
    this.polling = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    // Reset state
    this.previousCpu = null;
    this.previousSystem = null;
  }

  // === Recuperation stats ===
  async getStats() {
    const container = await this.compose.getContainer();
    const stats = await container.stats({ stream: false });

    return {
      cpu: this._calculateCpuPercent(stats),
      memory: this._calculateMemory(stats),
      network: this._calculateNetwork(stats),
      timestamp: new Date()
    };
  }

  // === Calcul CPU% (delta) ===
  _calculateCpuPercent(stats) {
    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage -
                     (stats.precpu_stats.cpu_usage?.total_usage || 0);
    const systemDelta = stats.cpu_stats.system_cpu_usage -
                        (stats.precpu_stats.system_cpu_usage || 0);
    const cpuCount = stats.cpu_stats.online_cpus ||
                     stats.cpu_stats.cpu_usage.percpu_usage?.length || 1;

    let cpuPercent = 0;
    if (systemDelta > 0 && cpuDelta > 0) {
      cpuPercent = (cpuDelta / systemDelta) * cpuCount * 100;
    }

    // Garder pour le prochain delta (alternative)
    this.previousCpu = stats.cpu_stats.cpu_usage.total_usage;
    this.previousSystem = stats.cpu_stats.system_cpu_usage;

    return {
      percent: Math.round(cpuPercent * 10) / 10,  // 1 decimale
      cores: cpuCount
    };
  }

  _calculateMemory(stats) {
    const usage = stats.memory_stats.usage || 0;
    const limit = stats.memory_stats.limit || 0;
    const cache = stats.memory_stats.stats?.cache || 0;

    // Usage reel = usage - cache
    const realUsage = usage - cache;

    return {
      used: realUsage,
      limit: limit,
      usedMB: Math.round(realUsage / 1024 / 1024),
      limitMB: Math.round(limit / 1024 / 1024),
      percent: limit > 0 ? Math.round((realUsage / limit) * 100) : 0
    };
  }

  _calculateNetwork(stats) {
    const networks = stats.networks || {};
    let rx = 0, tx = 0;

    for (const net of Object.values(networks)) {
      rx += net.rx_bytes || 0;
      tx += net.tx_bytes || 0;
    }

    return {
      rxBytes: rx,
      txBytes: tx,
      rxMB: Math.round(rx / 1024 / 1024 * 10) / 10,
      txMB: Math.round(tx / 1024 / 1024 * 10) / 10
    };
  }
}

module.exports = { StatsManager };
```

### 7. Readiness Check serveur

```javascript
// core/server/readiness.js

const net = require('net');
const { LogsManager } = require('../docker/logs');

class ReadinessChecker {
  constructor(compose, options = {}) {
    this.compose = compose;
    this.host = options.host || 'localhost';
    this.port = options.port || 25565;
    this.rconPort = options.rconPort || 25575;
  }

  // === Check complet ===
  async waitForReady(options = {}) {
    const {
      timeoutMs = 180000,  // 3 minutes
      pollIntervalMs = 2000,
      onProgress = () => {}
    } = options;

    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const elapsed = Date.now() - startTime;
      onProgress({ phase: 'checking', elapsedMs: elapsed, timeoutMs });

      // 1. Check container running
      const containerReady = await this._checkContainerRunning();
      if (!containerReady) {
        onProgress({ phase: 'waiting-container', elapsedMs: elapsed });
        await this._sleep(pollIntervalMs);
        continue;
      }

      // 2. Check "Done" dans les logs
      const doneLogged = await this._checkDoneLog();
      if (!doneLogged) {
        onProgress({ phase: 'waiting-startup', elapsedMs: elapsed });
        await this._sleep(pollIntervalMs);
        continue;
      }

      // 3. Check port 25565 accessible
      const portReady = await this._checkPort(this.port);
      if (!portReady) {
        onProgress({ phase: 'waiting-port', elapsedMs: elapsed });
        await this._sleep(pollIntervalMs);
        continue;
      }

      // 4. Check RCON port (optionnel)
      const rconReady = await this._checkPort(this.rconPort);

      onProgress({ phase: 'ready', elapsedMs: elapsed });
      return {
        ready: true,
        rconReady,
        startupTimeMs: elapsed
      };
    }

    throw new Error(`Server not ready after ${timeoutMs}ms`);
  }

  // === Checks individuels ===
  async _checkContainerRunning() {
    try {
      const container = await this.compose.getContainer();
      const info = await container.inspect();
      return info.State.Running === true;
    } catch {
      return false;
    }
  }

  async _checkDoneLog() {
    try {
      const logs = new LogsManager(this.compose);
      const snapshot = await logs.getSnapshot(100);

      // Chercher "Done" dans les logs recents
      return snapshot.some(log =>
        log.raw.includes('Done') && log.raw.includes('For help, type')
      );
    } catch {
      return false;
    }
  }

  async _checkPort(port) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(2000);

      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });

      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });

      socket.connect(port, this.host);
    });
  }

  _sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
}

module.exports = { ReadinessChecker };
```

### 8. Events Log minimal

```javascript
// core/events/logger.js

const fs = require('fs').promises;
const path = require('path');

const EventType = {
  SERVER_START: 'server_start',
  SERVER_STOP: 'server_stop',
  SERVER_RESTART: 'server_restart',
  SERVER_CRASH: 'server_crash',
  BACKUP_START: 'backup_start',
  BACKUP_COMPLETE: 'backup_complete',
  BACKUP_FAILED: 'backup_failed',
  RESTORE_START: 'restore_start',
  RESTORE_COMPLETE: 'restore_complete',
  CONFIG_CHANGE: 'config_change',
  PLAYER_JOIN: 'player_join',
  PLAYER_LEAVE: 'player_leave',
  RCON_COMMAND: 'rcon_command'
};

class EventLogger {
  constructor(paths) {
    this.logFile = paths.eventsLogFile;
    this.maxEntries = 1000;
  }

  async log(type, data = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      type,
      ...data
    };

    await this._appendEntry(entry);
    return entry;
  }

  async _appendEntry(entry) {
    try {
      // S'assurer que le dossier existe
      await fs.mkdir(path.dirname(this.logFile), { recursive: true });

      // Lire les entries existantes
      let entries = [];
      try {
        const content = await fs.readFile(this.logFile, 'utf8');
        entries = content.split('\n').filter(Boolean).map(JSON.parse);
      } catch {
        // Fichier n'existe pas encore
      }

      // Ajouter la nouvelle entry
      entries.push(entry);

      // Appliquer rotation
      if (entries.length > this.maxEntries) {
        entries = entries.slice(-this.maxEntries);
      }

      // Reecrire le fichier
      const content = entries.map(e => JSON.stringify(e)).join('\n');
      await fs.writeFile(this.logFile, content, 'utf8');
    } catch (error) {
      console.error('Failed to log event:', error);
    }
  }

  async getRecent(count = 50) {
    try {
      const content = await fs.readFile(this.logFile, 'utf8');
      const entries = content.split('\n').filter(Boolean).map(JSON.parse);
      return entries.slice(-count).reverse();
    } catch {
      return [];
    }
  }

  async getByType(type, count = 50) {
    const all = await this.getRecent(this.maxEntries);
    return all.filter(e => e.type === type).slice(0, count);
  }
}

module.exports = { EventLogger, EventType };
```

### 9. Securite console - Validation + Rate limit

```javascript
// electron/ipc-handlers.js (extrait)

const rateLimit = new Map();

function createRateLimiter(maxPerSecond = 5) {
  return {
    check(key) {
      const now = Date.now();
      const window = rateLimit.get(key) || [];

      // Nettoyer les vieilles entrees (> 1s)
      const recent = window.filter(t => now - t < 1000);

      if (recent.length >= maxPerSecond) {
        return false;  // Rate limited
      }

      recent.push(now);
      rateLimit.set(key, recent);
      return true;
    }
  };
}

const consoleLimiter = createRateLimiter(5);  // 5 commandes/sec max

// Handler console:command avec validation
ipcMain.handle('console:command', async (event, cmd) => {
  // 1. Rate limit
  if (!consoleLimiter.check('console')) {
    throw new Error('Rate limit exceeded (max 5 commands/sec)');
  }

  // 2. Validation type
  if (typeof cmd !== 'string') {
    throw new Error('Command must be a string');
  }

  // 3. Validation longueur
  if (cmd.length === 0) {
    throw new Error('Command cannot be empty');
  }
  if (cmd.length > 200) {
    throw new Error('Command too long (max 200 chars)');
  }

  // 4. Sanitization basique (pas de null bytes, etc.)
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(cmd)) {
    throw new Error('Command contains invalid characters');
  }

  // 5. Log pour audit
  await eventLogger.log(EventType.RCON_COMMAND, {
    command: cmd.substring(0, 50),  // Tronquer pour le log
    source: 'console'
  });

  // 6. Executer
  return core.rcon.send(cmd);
});
```

### 10. API Electron V0 (corrigee)

```javascript
// electron/preload.js - API V0

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Docker
  docker: {
    getStatus: () => ipcRenderer.invoke('docker:status'),
    openDockerDesktop: () => ipcRenderer.invoke('docker:open-desktop'),
    waitUntilReady: () => ipcRenderer.invoke('docker:wait-ready'),
    onStatusChange: (cb) => {
      ipcRenderer.on('docker:status-changed', (_, status) => cb(status));
      return () => ipcRenderer.removeListener('docker:status-changed', cb);
    }
  },

  // Server
  server: {
    start: () => ipcRenderer.invoke('server:start'),
    stop: () => ipcRenderer.invoke('server:stop'),
    restart: () => ipcRenderer.invoke('server:restart'),
    getStatus: () => ipcRenderer.invoke('server:status'),
    waitForReady: () => ipcRenderer.invoke('server:wait-ready'),
    onStatusChange: (cb) => {
      ipcRenderer.on('server:status-changed', (_, status) => cb(status));
      return () => ipcRenderer.removeListener('server:status-changed', cb);
    }
  },

  // Stats
  stats: {
    get: () => ipcRenderer.invoke('stats:get'),
    startPolling: (intervalMs) => ipcRenderer.invoke('stats:start-polling', intervalMs),
    stopPolling: () => ipcRenderer.invoke('stats:stop-polling'),
    onStats: (cb) => {
      ipcRenderer.on('stats:update', (_, stats) => cb(stats));
      return () => ipcRenderer.removeListener('stats:update', cb);
    }
  },

  // Config
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    set: (key, value) => ipcRenderer.invoke('config:set', key, value),
    getSchema: () => ipcRenderer.invoke('config:schema')
  },

  // Console (avec rate limit cote main)
  console: {
    sendCommand: (cmd) => ipcRenderer.invoke('console:command', cmd),
    getSnapshot: (lines) => ipcRenderer.invoke('console:snapshot', lines),
    startFollowing: () => ipcRenderer.invoke('console:start-follow'),
    stopFollowing: () => ipcRenderer.invoke('console:stop-follow'),
    onLog: (cb) => {
      ipcRenderer.on('console:log', (_, log) => cb(log));
      return () => ipcRenderer.removeListener('console:log', cb);
    }
  },

  // Events log
  events: {
    getRecent: (count) => ipcRenderer.invoke('events:recent', count)
  },

  // App
  app: {
    openFolder: (type) => ipcRenderer.invoke('app:open-folder', type),
    getVersion: () => ipcRenderer.invoke('app:version'),
    getPaths: () => ipcRenderer.invoke('app:paths')
  }
});
```

## Configuration (6-8 parametres critiques)

```javascript
// core/config/schema.js - V0

const ConfigSchemaV0 = {
  // 1. Version Minecraft
  'mc.version': {
    envVar: 'MC_VERSION',
    type: 'select',
    options: ['LATEST', '1.21.5', '1.21.4', '1.20.4'],
    default: 'LATEST',
    requiresRestart: true
  },

  // 2. Type de serveur
  'mc.type': {
    envVar: 'MC_TYPE',
    type: 'select',
    options: ['VANILLA', 'PAPER', 'SPIGOT', 'FABRIC', 'FORGE'],
    default: 'VANILLA',
    requiresRestart: true
  },

  // 3. RAM allouee
  'mc.memory': {
    envVar: 'MC_MEMORY',
    type: 'slider',
    min: 1, max: 16, step: 1, unit: 'G',
    default: '4G',
    requiresRestart: true
  },

  // 4. Max joueurs
  'mc.maxPlayers': {
    envVar: 'MC_MAX_PLAYERS',
    type: 'number',
    min: 1, max: 100,
    default: 10,
    requiresRestart: false
  },

  // 5. MOTD
  'server.motd': {
    target: 'server.properties',
    property: 'motd',
    type: 'text',
    maxLength: 59,
    default: 'A Minecraft Server',
    requiresRestart: false
  },

  // 6. Difficulte
  'server.difficulty': {
    target: 'server.properties',
    property: 'difficulty',
    type: 'select',
    options: ['peaceful', 'easy', 'normal', 'hard'],
    default: 'normal',
    requiresRestart: false
  },

  // 7. Mode online
  'server.onlineMode': {
    target: 'server.properties',
    property: 'online-mode',
    type: 'boolean',
    default: true,
    requiresRestart: true
  },

  // 8. Seed (optionnel)
  'server.seed': {
    target: 'server.properties',
    property: 'level-seed',
    type: 'text',
    default: '',
    requiresRestart: true
  }
};
```

## Retry avec Backoff

```javascript
// core/utils/retry.js

const RetryConfig = {
  maxAttempts: 10,
  initialDelay: 2000,
  maxDelay: 30000,
  totalTimeout: 180000,
  backoffFactor: 1.5
};

async function withRetry(fn, options = {}) {
  const config = { ...RetryConfig, ...options };
  let delay = config.initialDelay;
  const startTime = Date.now();

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    // Check timeout global
    if (Date.now() - startTime > config.totalTimeout) {
      throw new Error('Retry timeout exceeded');
    }

    try {
      return await fn(attempt);
    } catch (error) {
      if (attempt === config.maxAttempts) {
        throw error;
      }

      if (options.onRetry) {
        options.onRetry({ attempt, error, nextDelayMs: delay });
      }

      await new Promise(r => setTimeout(r, delay));
      delay = Math.min(delay * config.backoffFactor, config.maxDelay);
    }
  }
}

// Sequence: 2s -> 3s -> 4.5s -> 6.75s -> 10s -> 15s -> 22s -> 30s -> 30s -> 30s
```

## UI Dashboard V0

```
+-------------------------------------------------------------------+
|  MINECRAFT SERVER MANAGER                              [-][o][x]  |
+-------------------------------------------------------------------+
|                                                                    |
|  +- DOCKER ------------------------------------------------------+ |
|  |  [OK] Docker daemon OK  .  Version 24.0.7                     | |
|  |  OU                                                           | |
|  |  [!] Docker Desktop non demarre                               | |
|  |      [Ouvrir Docker Desktop]  [Guide depannage]               | |
|  +---------------------------------------------------------------+ |
|                                                                    |
|  +- SERVER ------------------------------------------------------+ |
|  |                                                                | |
|  |  Status: [RUNNING]    Uptime: 2h 34m    Players: 3/10        | |
|  |  CPU: 12%             RAM: 2.1GB / 4GB                        | |
|  |                                                                | |
|  |  [> Start]  [# Stop]  [@ Restart]                             | |
|  +---------------------------------------------------------------+ |
|                                                                    |
|  +- CONSOLE -----------------------------------------------------+ |
|  |  [12:34:56] [Server thread/INFO]: Player1 joined              | |
|  |  [12:35:02] [Server thread/INFO]: Player2 joined              | |
|  |  [12:36:15] [Server thread/INFO]: <Player1> Hello!            | |
|  |  ...                                                          | |
|  +---------------------------------------------------------------+ |
|  |  > [____________________________________] [Envoyer]           | |
|  +---------------------------------------------------------------+ |
|                                                                    |
|  +- CONFIG ------------------------------------------------------+ |
|  |  Version  [v 1.21.5]     Type  [v VANILLA]                    | |
|  |  RAM      [========    ] 4G  Max Players  [10]                | |
|  |  MOTD     [Mon serveur________________]                       | |
|  |  Difficulty [v normal]   Online Mode [x]                      | |
|  |                                          [Sauvegarder]        | |
|  +---------------------------------------------------------------+ |
|                                                                    |
+-------------------------------------------------------------------+
```

## Checklist V0

### Setup & Structure
- [ ] Setup monorepo (npm workspaces ou pnpm)
- [ ] core/package.json + dependances (dockerode, rcon-client)
- [ ] electron/package.json + config electron-builder
- [ ] ui/package.json + Vite/React setup

### Core - Docker
- [ ] paths.js - centralisation chemins
- [ ] docker/client.js - connexion dockerode
- [ ] docker/detector.js - detection + etats + actions
- [ ] docker/compose.js - CLI spawn + getServiceContainerId
- [ ] docker/logs.js - EventEmitter + snapshot/follow
- [ ] docker/stats.js - CPU% delta + tick 2s

### Core - Server
- [ ] server/readiness.js - port check + log "Done"
- [ ] rcon/client.js - connectWithRetry + queue + heartbeat

### Core - Config
- [ ] config/env-manager.js - lecture/ecriture .env
- [ ] config/schema.js - 8 parametres

### Core - Events & Utils
- [ ] events/logger.js - log minimal
- [ ] utils/retry.js - backoff exponentiel
- [ ] utils/logger.js - logging structure

### Electron
- [ ] main.js - window + security config
- [ ] preload.js - API blanche
- [ ] ipc-handlers.js - bridge + validation + rate limit

### UI
- [ ] DockerStatus.jsx + actions contextuelles
- [ ] ServerControls.jsx
- [ ] ServerStats.jsx
- [ ] Console.jsx + input securise
- [ ] ConfigPanel.jsx

### Build & Packaging
- [ ] electron-builder config
- [ ] ui/dist -> copie dans electron
- [ ] core/ bundle ou copie
- [ ] Test packaging Windows

### Tests
- [ ] Tests unitaires core
- [ ] Tests integration compose
- [ ] Test E2E basique

---

# V1 - Players + Backups

**Objectif** : Gestion complete des joueurs via RCON et systeme de backup fiable.

## Fichiers ajoutes/modifies V1

```
app/core/
+-- rcon/
|   +-- client.js         # (existant, enrichi)
|   +-- commands.js       # NOUVEAU - Whitelist, OP, kick, list
|   +-- parser.js         # NOUVEAU - Parse reponses RCON
+-- backup/
|   +-- backup.js         # NOUVEAU - Via helper container
|   +-- restore.js        # NOUVEAU - Stop -> restore -> start
|   +-- retention.js      # NOUVEAU - Rotation + taille totale
|   +-- helper.js         # NOUVEAU - Container alpine pour tar
+-- utils/
    +-- validator.js      # NOUVEAU - Validation entrees

app/ui/src/
+-- components/
|   +-- PlayersPanel.jsx  # NOUVEAU
|   +-- WhitelistManager.jsx  # NOUVEAU
|   +-- OpsManager.jsx    # NOUVEAU
|   +-- BackupsPanel.jsx  # NOUVEAU
|   +-- BackupProgress.jsx  # NOUVEAU
+-- hooks/
    +-- usePlayers.js     # NOUVEAU
    +-- useBackups.js     # NOUVEAU
```

## Backup via Helper Container

**Probleme** : tar/gzip pas disponible nativement sur Windows, chemins volumes problematiques.

**Solution** : Container alpine ephemere qui monte les volumes et fait le tar.

```javascript
// core/backup/helper.js

const Docker = require('dockerode');

class BackupHelper {
  constructor(docker, paths) {
    this.docker = docker;
    this.paths = paths;
    this.helperImage = 'alpine:latest';
  }

  async createBackup(backupName) {
    const container = await this.docker.createContainer({
      Image: this.helperImage,
      Cmd: [
        'sh', '-c',
        `tar -czf /backups/${backupName} -C /data world world_nether world_the_end server.properties whitelist.json ops.json banned-players.json banned-ips.json 2>/dev/null || true`
      ],
      HostConfig: {
        Binds: [
          `${this.paths.dataDir}:/data:ro`,
          `${this.paths.backupsDir}:/backups`
        ],
        AutoRemove: true
      }
    });

    await container.start();
    await container.wait();

    return {
      filename: backupName,
      path: `${this.paths.backupsDir}/${backupName}`
    };
  }

  async restoreBackup(backupName) {
    const container = await this.docker.createContainer({
      Image: this.helperImage,
      Cmd: [
        'sh', '-c',
        `cd /data && rm -rf world world_nether world_the_end && tar -xzf /backups/${backupName} -C /data`
      ],
      HostConfig: {
        Binds: [
          `${this.paths.dataDir}:/data`,
          `${this.paths.backupsDir}:/backups:ro`
        ],
        AutoRemove: true
      }
    });

    await container.start();
    await container.wait();
  }
}

module.exports = { BackupHelper };
```

```javascript
// core/backup/backup.js

const EventEmitter = require('events');
const { BackupHelper } = require('./helper');
const { EventType } = require('../events/logger');

class BackupManager extends EventEmitter {
  constructor(compose, rcon, paths, eventLogger) {
    super();
    this.compose = compose;
    this.rcon = rcon;
    this.paths = paths;
    this.eventLogger = eventLogger;
    this.helper = new BackupHelper(compose.docker, paths);
  }

  async createBackup(options = {}) {
    const { notifyPlayers = true } = options;
    const backupName = `backup-${this._timestamp()}.tar.gz`;

    await this.eventLogger.log(EventType.BACKUP_START, { backupName });
    this.emit('progress', { step: 'start', percent: 0 });

    try {
      // 1. Notifier les joueurs (5%)
      if (notifyPlayers && this.rcon.connected) {
        await this.rcon.send('say [Backup] Sauvegarde en cours...');
      }
      this.emit('progress', { step: 'notify', percent: 5 });

      // 2. Desactiver auto-save (10%)
      if (this.rcon.connected) {
        await this.rcon.send('save-off');
      }
      this.emit('progress', { step: 'save-off', percent: 10 });

      // 3. Forcer sauvegarde (20%)
      if (this.rcon.connected) {
        await this.rcon.send('save-all flush');
        await this._waitForSave();
      }
      this.emit('progress', { step: 'save-all', percent: 30 });

      // 4. Creer archive via helper container (30% -> 90%)
      this.emit('progress', { step: 'archive', percent: 30 });
      const result = await this.helper.createBackup(backupName);
      this.emit('progress', { step: 'archive-done', percent: 90 });

      // 5. Reactiver auto-save (95%)
      if (this.rcon.connected) {
        await this.rcon.send('save-on');
        await this.rcon.send('say [Backup] Sauvegarde terminee!');
      }
      this.emit('progress', { step: 'save-on', percent: 95 });

      // 6. Appliquer retention (100%)
      await this.applyRetention();
      this.emit('progress', { step: 'complete', percent: 100 });

      await this.eventLogger.log(EventType.BACKUP_COMPLETE, {
        backupName,
        path: result.path
      });

      return result;

    } catch (error) {
      // Toujours reactiver save-on en cas d'erreur
      if (this.rcon.connected) {
        try { await this.rcon.send('save-on'); } catch {}
      }

      await this.eventLogger.log(EventType.BACKUP_FAILED, {
        backupName,
        error: error.message
      });

      throw error;
    }
  }

  async _waitForSave(timeoutMs = 30000) {
    // Attendre que le serveur finisse de sauvegarder
    // En verifiant les logs pour "Saved the game"
    await new Promise(r => setTimeout(r, 5000));  // Simplification V1
  }

  _timestamp() {
    return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  }

  async applyRetention(config = {}) {
    const { maxCount = 10, maxSizeGB = 5, minKeep = 2 } = config;
    // Implementation retention (voir plan original)
  }
}

module.exports = { BackupManager };
```

## RCON Commands

```javascript
// core/rcon/commands.js

class RconCommands {
  constructor(client) {
    this.client = client;
  }

  // === Whitelist ===
  async whitelistAdd(name) {
    this._validatePlayerName(name);
    return this.client.send(`whitelist add ${name}`);
  }

  async whitelistRemove(name) {
    this._validatePlayerName(name);
    return this.client.send(`whitelist remove ${name}`);
  }

  async whitelistList() {
    const response = await this.client.send('whitelist list');
    return this._parsePlayerList(response);
  }

  // === OPs ===
  async opAdd(name) {
    this._validatePlayerName(name);
    return this.client.send(`op ${name}`);
  }

  async opRemove(name) {
    this._validatePlayerName(name);
    return this.client.send(`deop ${name}`);
  }

  // === Players online ===
  async listOnline() {
    const response = await this.client.send('list');
    return this._parseOnlineList(response);
  }

  async kick(name, reason = '') {
    this._validatePlayerName(name);
    return this.client.send(`kick ${name} ${reason}`.trim());
  }

  // === Validation ===
  _validatePlayerName(name) {
    if (typeof name !== 'string') throw new Error('Invalid type');
    if (name.length < 3 || name.length > 16) throw new Error('Invalid length (3-16 chars)');
    if (!/^[a-zA-Z0-9_]+$/.test(name)) throw new Error('Invalid characters (a-z, 0-9, _)');
  }

  // === Parsing ===
  _parsePlayerList(response) {
    const match = response.match(/:\s*(.*)$/);
    if (!match || !match[1].trim()) return [];
    return match[1].split(',').map(p => p.trim()).filter(Boolean);
  }

  _parseOnlineList(response) {
    const countMatch = response.match(/There are (\d+) of/);
    const maxMatch = response.match(/max of (\d+)/);
    const playersMatch = response.match(/online:\s*(.*)$/);

    return {
      count: countMatch ? parseInt(countMatch[1]) : 0,
      max: maxMatch ? parseInt(maxMatch[1]) : 0,
      players: playersMatch && playersMatch[1].trim()
        ? playersMatch[1].split(',').map(p => p.trim()).filter(Boolean)
        : []
    };
  }
}

module.exports = { RconCommands };
```

## API Electron V1 (ajouts)

```javascript
// electron/preload.js - Ajouts V1

// Players (via RCON)
players: {
  getOnline: () => ipcRenderer.invoke('players:online'),
  getWhitelist: () => ipcRenderer.invoke('players:whitelist'),
  addToWhitelist: (name) => ipcRenderer.invoke('players:whitelist-add', name),
  removeFromWhitelist: (name) => ipcRenderer.invoke('players:whitelist-remove', name),
  getOps: () => ipcRenderer.invoke('players:ops'),
  addOp: (name) => ipcRenderer.invoke('players:op-add', name),
  removeOp: (name) => ipcRenderer.invoke('players:op-remove', name),
  kick: (name, reason) => ipcRenderer.invoke('players:kick', name, reason),
},

// Backups
backup: {
  list: () => ipcRenderer.invoke('backup:list'),
  create: () => ipcRenderer.invoke('backup:create'),
  restore: (filename) => ipcRenderer.invoke('backup:restore', filename),
  delete: (filename) => ipcRenderer.invoke('backup:delete', filename),
  getSettings: () => ipcRenderer.invoke('backup:settings'),
  setSettings: (settings) => ipcRenderer.invoke('backup:set-settings', settings),
  onProgress: (cb) => {
    ipcRenderer.on('backup:progress', (_, progress) => cb(progress));
    return () => ipcRenderer.removeListener('backup:progress', cb);
  },
},
```

## Checklist V1

- [ ] Core: RCON commands (whitelist, op, kick)
- [ ] Core: RCON parser
- [ ] Core: Validation des noms de joueurs
- [ ] Core: Fallback lecture fichiers JSON
- [ ] Core: BackupHelper (container alpine)
- [ ] Core: BackupManager (save-off -> tar -> save-on)
- [ ] Core: Restore
- [ ] Core: Retention backups
- [ ] Electron: IPC handlers players
- [ ] Electron: IPC handlers backups
- [ ] UI: Players panel
- [ ] UI: Whitelist manager
- [ ] UI: Ops manager
- [ ] UI: Backups panel
- [ ] UI: Backup progress
- [ ] Tests backup/restore
- [ ] Tests RCON commands

---

# V2 - Mods + Automation

**Objectif** : Gestion des mods/plugins, scheduler automatique, et mise a jour d'image.

## Decision : Modrinth prioritaire

**CurseForge** : API complexe, cles necessaires, TOS restrictives -> **repousse a V2.5 ou future**.

**V2** : Modrinth + installation via fichier local / URL directe.

## Fichiers ajoutes V2

```
app/core/
+-- mods/
|   +-- manager.js        # NOUVEAU - Install/remove mods
|   +-- sources/
|   |   +-- modrinth.js   # NOUVEAU - API Modrinth
|   |   +-- local.js      # NOUVEAU - Fichier local / URL
|   +-- compatibility.js  # NOUVEAU - Check version/loader
|   +-- cache.js          # NOUVEAU - Cache metadata
+-- scheduler/
|   +-- scheduler.js      # NOUVEAU - Cron-like scheduler
|   +-- jobs/
|   |   +-- backup.js     # NOUVEAU - Auto-backup job
|   |   +-- restart.js    # NOUVEAU - Auto-restart job
|   |   +-- update.js     # NOUVEAU - Auto-update check
|   +-- persistence.js    # NOUVEAU - Persist schedules
+-- updates/
    +-- checker.js        # NOUVEAU - Check MC/image updates
    +-- updater.js        # NOUVEAU - Pull new image

app/ui/src/
+-- components/
|   +-- ModsPanel.jsx     # NOUVEAU
|   +-- ModBrowser.jsx    # NOUVEAU
|   +-- LocalModInstall.jsx  # NOUVEAU - Drag & drop
|   +-- SchedulerPanel.jsx  # NOUVEAU
|   +-- UpdatesPanel.jsx  # NOUVEAU
+-- hooks/
    +-- useMods.js        # NOUVEAU
    +-- useScheduler.js   # NOUVEAU
```

## Mods - Installation multi-sources

```javascript
// core/mods/manager.js

class ModManager {
  constructor(compose, paths, serverType, mcVersion) {
    this.compose = compose;
    this.paths = paths;
    this.serverType = serverType;
    this.mcVersion = mcVersion;
    this.modsDir = this._getModsDir();
  }

  _getModsDir() {
    switch (this.serverType) {
      case 'PAPER':
      case 'SPIGOT':
        return path.join(this.paths.dataDir, 'plugins');
      case 'FABRIC':
      case 'FORGE':
        return path.join(this.paths.dataDir, 'mods');
      default:
        return null;
    }
  }

  // === Installation depuis Modrinth ===
  async installFromModrinth(projectId, versionId = null) {
    const modrinth = new ModrinthSource();

    // Recuperer la version compatible
    const version = versionId
      ? await modrinth.getVersion(versionId)
      : await modrinth.getLatestCompatible(projectId, this.mcVersion, this._getLoader());

    // Telecharger
    const file = await modrinth.download(version);

    // Copier dans le dossier mods
    await this._installFile(file.path, file.filename);

    return { installed: true, mod: version, requiresRestart: true };
  }

  // === Installation depuis fichier local ===
  async installFromFile(filePath) {
    const filename = path.basename(filePath);

    if (!filename.endsWith('.jar')) {
      throw new Error('Only .jar files are supported');
    }

    await this._installFile(filePath, filename);

    return { installed: true, filename, requiresRestart: true };
  }

  // === Installation depuis URL ===
  async installFromUrl(url) {
    const response = await fetch(url);
    const filename = this._extractFilename(url, response);

    const tempPath = path.join(os.tmpdir(), filename);
    const buffer = await response.arrayBuffer();
    await fs.writeFile(tempPath, Buffer.from(buffer));

    await this._installFile(tempPath, filename);
    await fs.unlink(tempPath);

    return { installed: true, filename, requiresRestart: true };
  }

  async _installFile(sourcePath, filename) {
    const destPath = path.join(this.modsDir, filename);
    await fs.copyFile(sourcePath, destPath);
  }

  _getLoader() {
    switch (this.serverType) {
      case 'PAPER':
      case 'SPIGOT':
        return 'paper';
      case 'FABRIC':
        return 'fabric';
      case 'FORGE':
        return 'forge';
      default:
        return null;
    }
  }
}
```

## Scheduler

```javascript
// core/scheduler/scheduler.js

const cron = require('node-cron');

class Scheduler {
  constructor(persistence) {
    this.jobs = new Map();
    this.persistence = persistence;
    this.executors = {};
  }

  registerExecutor(type, executor) {
    this.executors[type] = executor;
  }

  async init() {
    const saved = await this.persistence.load();
    for (const job of saved) {
      this._scheduleJob(job);
    }
  }

  _scheduleJob(job) {
    if (!cron.validate(job.cron)) {
      throw new Error(`Invalid cron expression: ${job.cron}`);
    }

    const task = cron.schedule(job.cron, () => this._execute(job), {
      scheduled: job.enabled
    });

    this.jobs.set(job.id, { ...job, task });
  }

  async _execute(job) {
    const executor = this.executors[job.type];
    if (!executor) {
      console.error(`No executor for job type: ${job.type}`);
      return;
    }

    try {
      await executor(job.config);
    } catch (error) {
      console.error(`Job ${job.id} failed:`, error);
    }
  }

  // === CRUD ===
  async create(job) {
    job.id = job.id || `job-${Date.now()}`;
    this._scheduleJob(job);
    await this.persistence.save([...this.jobs.values()]);
    return job;
  }

  async enable(jobId) {
    const job = this.jobs.get(jobId);
    if (job) {
      job.task.start();
      job.enabled = true;
      await this.persistence.save([...this.jobs.values()]);
    }
  }

  async disable(jobId) {
    const job = this.jobs.get(jobId);
    if (job) {
      job.task.stop();
      job.enabled = false;
      await this.persistence.save([...this.jobs.values()]);
    }
  }

  async delete(jobId) {
    const job = this.jobs.get(jobId);
    if (job) {
      job.task.stop();
      this.jobs.delete(jobId);
      await this.persistence.save([...this.jobs.values()]);
    }
  }

  getNextRuns() {
    // Retourner les prochaines executions prevues
    return [...this.jobs.values()]
      .filter(j => j.enabled)
      .map(j => ({
        id: j.id,
        type: j.type,
        nextRun: this._getNextRun(j.cron)
      }));
  }

  _getNextRun(cronExpr) {
    // Calcul simplifie - utiliser une lib comme cron-parser
    return null;
  }
}

module.exports = { Scheduler };
```

## API Electron V2 (ajouts)

```javascript
// electron/preload.js - Ajouts V2

// Mods
mods: {
  list: () => ipcRenderer.invoke('mods:list'),
  search: (query, filters) => ipcRenderer.invoke('mods:search', query, filters),
  installFromModrinth: (projectId, versionId) =>
    ipcRenderer.invoke('mods:install-modrinth', projectId, versionId),
  installFromFile: (filePath) => ipcRenderer.invoke('mods:install-file', filePath),
  installFromUrl: (url) => ipcRenderer.invoke('mods:install-url', url),
  remove: (filename) => ipcRenderer.invoke('mods:remove', filename),
  checkUpdates: () => ipcRenderer.invoke('mods:check-updates'),
},

// Scheduler
scheduler: {
  list: () => ipcRenderer.invoke('scheduler:list'),
  create: (job) => ipcRenderer.invoke('scheduler:create', job),
  update: (jobId, changes) => ipcRenderer.invoke('scheduler:update', jobId, changes),
  delete: (jobId) => ipcRenderer.invoke('scheduler:delete', jobId),
  enable: (jobId) => ipcRenderer.invoke('scheduler:enable', jobId),
  disable: (jobId) => ipcRenderer.invoke('scheduler:disable', jobId),
  getNextRuns: () => ipcRenderer.invoke('scheduler:next-runs'),
},

// Updates
updates: {
  checkImage: () => ipcRenderer.invoke('updates:check-image'),
  checkMcVersions: () => ipcRenderer.invoke('updates:check-mc'),
  pullImage: () => ipcRenderer.invoke('updates:pull-image'),
  updateServer: (options) => ipcRenderer.invoke('updates:update-server'),
  onProgress: (cb) => {
    ipcRenderer.on('updates:progress', (_, progress) => cb(progress));
    return () => ipcRenderer.removeListener('updates:progress', cb);
  },
},
```

## Checklist V2

### Mods
- [ ] Core: ModManager
- [ ] Core: Modrinth API client
- [ ] Core: Installation fichier local
- [ ] Core: Installation URL directe
- [ ] Core: Compatibility checker
- [ ] UI: Mods panel
- [ ] UI: Mod browser (Modrinth)
- [ ] UI: Drag & drop local install

### Scheduler
- [ ] Core: Scheduler engine (node-cron)
- [ ] Core: Persistence jobs
- [ ] Core: Auto-backup job
- [ ] Core: Auto-restart job
- [ ] UI: Scheduler panel
- [ ] UI: Job editor

### Updates
- [ ] Core: Image update checker
- [ ] Core: MC version checker
- [ ] Core: Image puller avec progress
- [ ] UI: Updates panel

### Future (V2.5+)
- [ ] CurseForge integration (si demande)
- [ ] Auto-update mods
- [ ] Mod profiles/presets

---

# Packaging Electron

## Structure build

```
app/
+-- core/                 # Inclus dans asar
+-- electron/             # Main process
|   +-- main.js
|   +-- preload.js
|   +-- ipc-handlers.js
+-- ui/
|   +-- dist/             # Build Vite -> copie dans electron
+-- package.json          # Root avec electron-builder config
```

## Configuration electron-builder

```json
// package.json (root)
{
  "name": "minecraft-server-manager",
  "version": "0.1.0",
  "main": "electron/main.js",
  "scripts": {
    "dev": "concurrently \"npm run dev:ui\" \"npm run dev:electron\"",
    "dev:ui": "cd ui && npm run dev",
    "dev:electron": "electron .",
    "build": "npm run build:ui && npm run build:electron",
    "build:ui": "cd ui && npm run build",
    "build:electron": "electron-builder"
  },
  "build": {
    "appId": "com.minecraft.server-manager",
    "productName": "Minecraft Server Manager",
    "directories": {
      "output": "dist-electron"
    },
    "files": [
      "electron/**/*",
      "core/**/*",
      "ui/dist/**/*"
    ],
    "extraResources": [],
    "win": {
      "target": ["nsis", "portable"],
      "icon": "assets/icon.ico"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true
    }
  },
  "dependencies": {
    "dockerode": "^4.0.0",
    "rcon-client": "^4.2.0",
    "node-cron": "^3.0.0",
    "dotenv": "^16.0.0"
  },
  "devDependencies": {
    "electron": "^28.0.0",
    "electron-builder": "^24.0.0",
    "concurrently": "^8.0.0"
  }
}
```

## Notes packaging

1. **dockerode** : Pas de native deps problematiques sur Windows
2. **ui/dist** : Build Vite copie dans le dossier, charge via `file://` ou serveur local
3. **core/** : Module Node pur, bundle dans asar sans probleme
4. **Electron main** : Charge preload + ui/dist/index.html

---

# Resume des versions

| | V0 | V1 | V2 |
|---|---|---|---|
| **Docker** | Detection + compose CLI + container ID | - | Image updates |
| **Server** | Start/Stop/Restart + Readiness check | - | Auto-restart |
| **Status** | State + Uptime + Stats (CPU% delta) | - | - |
| **Console** | Logs EventEmitter + RCON queue | - | - |
| **Config** | 8 params + paths centralises | - | - |
| **Security** | Rate limit + validation console | - | - |
| **Events** | Log minimal | - | - |
| **Players** | - | Whitelist + OP + Kick | - |
| **Backups** | - | Helper container + Retention | Auto-scheduler |
| **Mods** | - | - | Modrinth + Local + URL |
| **Scheduler** | - | - | Cron jobs |

## Ordre de developpement recommande

```
V0 (MVP)
+-- 1. Setup monorepo + workspaces
+-- 2. Core paths.js (centralisation)
+-- 3. Core Docker (client, detector, compose CLI)
+-- 4. Core Docker (logs EventEmitter, stats delta)
+-- 5. Core Server (readiness check)
+-- 6. Core RCON (client avec queue + reconnect)
+-- 7. Core Config (env-manager, schema)
+-- 8. Core Events (logger minimal)
+-- 9. Core Utils (retry, logger)
+-- 10. Electron shell (main, preload, ipc + validation)
+-- 11. UI components
+-- 12. Packaging + Tests

V1 (Players + Backups)
+-- 1. Core RCON (commands, parser)
+-- 2. Core Backup (helper container)
+-- 3. Core Backup (manager, restore, retention)
+-- 4. Electron IPC handlers
+-- 5. UI Players + Backups
+-- 6. Tests

V2 (Mods + Automation)
+-- 1. Core Mods (Modrinth + local + URL)
+-- 2. Core Scheduler
+-- 3. Core Updates
+-- 4. Electron IPC handlers
+-- 5. UI components
+-- 6. Tests + Documentation
```
