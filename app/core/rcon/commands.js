/**
 * RCON Commands - High-level player management commands
 * Wraps RconClient with parsed responses
 */

const { parsePlayerList, parseWhitelist, parseOpList, parseCommandResponse } = require('./parser');

class RconCommands {
  /**
   * @param {import('./client').RconClient} rconClient
   */
  constructor(rconClient) {
    this.rcon = rconClient;
  }

  // === Player Management ===

  /**
   * Get list of online players
   * @returns {Promise<{online: number, max: number, players: string[]}>}
   */
  async listPlayers() {
    const response = await this.rcon.send('list');
    return parsePlayerList(response);
  }

  /**
   * Kick a player
   * @param {string} player - Player name
   * @param {string} reason - Kick reason (optional)
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async kick(player, reason = '') {
    const cmd = reason ? `kick ${player} ${reason}` : `kick ${player}`;
    const response = await this.rcon.send(cmd);
    return parseCommandResponse(response, 'kick');
  }

  /**
   * Ban a player
   * @param {string} player - Player name
   * @param {string} reason - Ban reason (optional)
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async ban(player, reason = '') {
    const cmd = reason ? `ban ${player} ${reason}` : `ban ${player}`;
    const response = await this.rcon.send(cmd);
    return parseCommandResponse(response, 'ban');
  }

  /**
   * Pardon (unban) a player
   * @param {string} player - Player name
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async pardon(player) {
    const response = await this.rcon.send(`pardon ${player}`);
    return parseCommandResponse(response, 'pardon');
  }

  /**
   * Get ban list
   * @returns {Promise<string[]>}
   */
  async getBanList() {
    const response = await this.rcon.send('banlist');
    return parseBanList(response);
  }

  // === Whitelist Management ===

  /**
   * Get whitelist
   * @returns {Promise<{enabled: boolean, players: string[]}>}
   */
  async getWhitelist() {
    const response = await this.rcon.send('whitelist list');
    return parseWhitelist(response);
  }

  /**
   * Add player to whitelist
   * @param {string} player - Player name
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async whitelistAdd(player) {
    const response = await this.rcon.send(`whitelist add ${player}`);
    return parseCommandResponse(response, 'whitelist add');
  }

  /**
   * Remove player from whitelist
   * @param {string} player - Player name
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async whitelistRemove(player) {
    const response = await this.rcon.send(`whitelist remove ${player}`);
    return parseCommandResponse(response, 'whitelist remove');
  }

  /**
   * Enable whitelist
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async whitelistOn() {
    const response = await this.rcon.send('whitelist on');
    return parseCommandResponse(response, 'whitelist on');
  }

  /**
   * Disable whitelist
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async whitelistOff() {
    const response = await this.rcon.send('whitelist off');
    return parseCommandResponse(response, 'whitelist off');
  }

  /**
   * Reload whitelist from file
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async whitelistReload() {
    const response = await this.rcon.send('whitelist reload');
    return parseCommandResponse(response, 'whitelist reload');
  }

  // === Operator Management ===

  /**
   * Get list of operators
   * @returns {Promise<string[]>}
   */
  async getOps() {
    const response = await this.rcon.send('op list');
    // Fallback: some servers don't support 'op list', try parsing from file
    return parseOpList(response);
  }

  /**
   * Add operator
   * @param {string} player - Player name
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async opAdd(player) {
    const response = await this.rcon.send(`op ${player}`);
    return parseCommandResponse(response, 'op');
  }

  /**
   * Remove operator
   * @param {string} player - Player name
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async opRemove(player) {
    const response = await this.rcon.send(`deop ${player}`);
    return parseCommandResponse(response, 'deop');
  }

  // === Server Commands ===

  /**
   * Send a message to all players
   * @param {string} message - Message to broadcast
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async say(message) {
    const response = await this.rcon.send(`say ${message}`);
    return { success: true, message: response || 'Message sent' };
  }

  /**
   * Send a private message to a player
   * @param {string} player - Player name
   * @param {string} message - Message
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async tell(player, message) {
    const response = await this.rcon.send(`tell ${player} ${message}`);
    return parseCommandResponse(response, 'tell');
  }

  /**
   * Save the world
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async saveAll() {
    const response = await this.rcon.send('save-all');
    return { success: true, message: response || 'World saved' };
  }

  /**
   * Get server difficulty
   * @returns {Promise<string>}
   */
  async getDifficulty() {
    const response = await this.rcon.send('difficulty');
    // Response: "The difficulty is <difficulty>"
    const match = response.match(/difficulty is (\w+)/i);
    return match ? match[1].toLowerCase() : 'unknown';
  }

  /**
   * Set server difficulty
   * @param {string} difficulty - peaceful, easy, normal, hard
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async setDifficulty(difficulty) {
    const response = await this.rcon.send(`difficulty ${difficulty}`);
    return parseCommandResponse(response, 'difficulty');
  }

  /**
   * Get current gamemode of a player
   * @param {string} player - Player name
   * @returns {Promise<string>}
   */
  async getGamemode(player) {
    // No direct command, would need to use /data get
    return 'unknown';
  }

  /**
   * Set gamemode for a player
   * @param {string} player - Player name
   * @param {string} mode - survival, creative, adventure, spectator
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async setGamemode(player, mode) {
    const response = await this.rcon.send(`gamemode ${mode} ${player}`);
    return parseCommandResponse(response, 'gamemode');
  }

  /**
   * Teleport a player
   * @param {string} player - Player to teleport
   * @param {string} target - Target (player name or coordinates)
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async teleport(player, target) {
    const response = await this.rcon.send(`tp ${player} ${target}`);
    return parseCommandResponse(response, 'tp');
  }

  /**
   * Give an item to a player
   * @param {string} player - Player name
   * @param {string} item - Item ID (e.g., "minecraft:diamond")
   * @param {number} count - Amount (default: 1)
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async give(player, item, count = 1) {
    const response = await this.rcon.send(`give ${player} ${item} ${count}`);
    return parseCommandResponse(response, 'give');
  }

  /**
   * Set time
   * @param {string|number} time - day, night, noon, midnight, or ticks
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async setTime(time) {
    const response = await this.rcon.send(`time set ${time}`);
    return parseCommandResponse(response, 'time');
  }

  /**
   * Set weather
   * @param {string} weather - clear, rain, thunder
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async setWeather(weather) {
    const response = await this.rcon.send(`weather ${weather}`);
    return parseCommandResponse(response, 'weather');
  }
}

/**
 * Parse ban list response
 * Minecraft formats:
 * - "There are 0 ban(s):"
 * - "There are 2 ban(s):\nplayer1\nplayer2"
 * - "There are no bans"
 * @param {string} response
 * @returns {string[]}
 */
function parseBanList(response) {
  if (!response) {
    return [];
  }

  // Check for no bans (various formats)
  if (response.includes('There are no bans') ||
      response.includes('There are 0 ban') ||
      response.match(/There are 0 /i)) {
    return [];
  }

  // Split by newlines and/or commas
  const colonIndex = response.indexOf(':');
  if (colonIndex === -1) {
    return [];
  }

  const playersPart = response.substring(colonIndex + 1);

  // Handle both newline-separated and comma-separated formats
  const players = playersPart
    .split(/[\n,]+/)
    .map(p => p.trim())
    .filter(Boolean)
    // Filter out any remaining header text
    .filter(p => !p.match(/^There are/i));

  return players;
}

module.exports = { RconCommands };
