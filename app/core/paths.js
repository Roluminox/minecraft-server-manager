/**
 * Centralized path management for the Minecraft Server Manager
 * Single source of truth for all file and directory paths
 */

const path = require('path');

class Paths {
  /**
   * @param {string} projectRoot - Root directory of the Minecraft server project
   */
  constructor(projectRoot) {
    this.projectRoot = path.resolve(projectRoot);
  }

  // === Project Files ===

  /** Path to .env file */
  get envFile() {
    return path.join(this.projectRoot, '.env');
  }

  /** Path to docker-compose.yml */
  get composeFile() {
    return path.join(this.projectRoot, 'docker-compose.yml');
  }

  // === Data Volume (mounted from host) ===

  /** Path to data directory (Minecraft server data) */
  get dataDir() {
    return path.join(this.projectRoot, 'data');
  }

  /** Path to server.properties */
  get serverProperties() {
    return path.join(this.dataDir, 'server.properties');
  }

  /** Path to whitelist.json */
  get whitelistFile() {
    return path.join(this.dataDir, 'whitelist.json');
  }

  /** Path to ops.json */
  get opsFile() {
    return path.join(this.dataDir, 'ops.json');
  }

  /** Path to banned-players.json */
  get bannedPlayersFile() {
    return path.join(this.dataDir, 'banned-players.json');
  }

  /** Path to banned-ips.json */
  get bannedIpsFile() {
    return path.join(this.dataDir, 'banned-ips.json');
  }

  // === Backups ===

  /** Path to backups directory */
  get backupsDir() {
    return path.join(this.projectRoot, 'backups');
  }

  // === Application Logs ===

  /** Path to application logs directory */
  get appLogsDir() {
    return path.join(this.projectRoot, 'logs');
  }

  /** Path to events log file */
  get eventsLogFile() {
    return path.join(this.appLogsDir, 'events.log');
  }

  // === Mods/Plugins (for V2) ===

  /** Path to mods directory (Fabric/Forge) */
  get modsDir() {
    return path.join(this.dataDir, 'mods');
  }

  /** Path to plugins directory (Paper/Spigot) */
  get pluginsDir() {
    return path.join(this.dataDir, 'plugins');
  }

  // === Container Paths (for docker exec) ===

  static container = {
    data: '/data',
    world: '/data/world',
    worldNether: '/data/world_nether',
    worldTheEnd: '/data/world_the_end',
    mods: '/data/mods',
    plugins: '/data/plugins',
    serverProperties: '/data/server.properties',
    whitelist: '/data/whitelist.json',
    ops: '/data/ops.json',
    backups: '/backups'
  };

  // === Utility Methods ===

  /**
   * Get relative path from project root
   * @param {string} absolutePath
   * @returns {string}
   */
  relative(absolutePath) {
    return path.relative(this.projectRoot, absolutePath);
  }

  /**
   * Resolve a path relative to project root
   * @param {...string} segments
   * @returns {string}
   */
  resolve(...segments) {
    return path.join(this.projectRoot, ...segments);
  }

  /**
   * Check if a path is within the project root (security check)
   * @param {string} targetPath
   * @returns {boolean}
   */
  isWithinProject(targetPath) {
    const resolved = path.resolve(targetPath);
    return resolved.startsWith(this.projectRoot);
  }
}

module.exports = { Paths };
