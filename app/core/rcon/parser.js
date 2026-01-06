/**
 * RCON Response Parser
 * Parses various Minecraft server responses
 */

/**
 * Parse player list response
 * Response formats:
 * - "There are X of a max of Y players online: player1, player2"
 * - "There are X/Y players online: player1, player2"
 * - "There are 0 of a max of 10 players online:"
 * @param {string} response
 * @returns {{online: number, max: number, players: string[]}}
 */
function parsePlayerList(response) {
  if (!response) {
    return { online: 0, max: 0, players: [] };
  }

  // Try to match "X of a max of Y" format
  let match = response.match(/There are (\d+) of a max of (\d+) players online/i);
  if (!match) {
    // Try "X/Y" format
    match = response.match(/There are (\d+)\/(\d+) players online/i);
  }

  if (!match) {
    return { online: 0, max: 0, players: [] };
  }

  const online = parseInt(match[1], 10);
  const max = parseInt(match[2], 10);

  // Extract player names after the colon
  const colonIndex = response.indexOf(':');
  let players = [];

  if (colonIndex !== -1 && online > 0) {
    const playersPart = response.substring(colonIndex + 1).trim();
    if (playersPart) {
      players = playersPart
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
    }
  }

  return { online, max, players };
}

/**
 * Parse whitelist response
 * Response formats:
 * - "There are X whitelisted players: player1, player2"
 * - "There are no whitelisted players"
 * - "Whitelist is enabled/disabled"
 * @param {string} response
 * @returns {{enabled: boolean, players: string[]}}
 */
function parseWhitelist(response) {
  if (!response) {
    return { enabled: true, players: [] };
  }

  // Check if response indicates whitelist status
  const enabledMatch = response.match(/Whitelist is (on|off|enabled|disabled)/i);
  const enabled = enabledMatch
    ? enabledMatch[1].toLowerCase() === 'on' || enabledMatch[1].toLowerCase() === 'enabled'
    : true;

  // Check for no players
  if (response.includes('no whitelisted players') || response.includes('There are 0')) {
    return { enabled, players: [] };
  }

  // Extract player count and names
  const match = response.match(/There are (\d+) whitelisted players?:\s*(.+)/i);
  if (match) {
    const players = match[2]
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    return { enabled, players };
  }

  // Try alternative format
  const altMatch = response.match(/:\s*(.+)$/);
  if (altMatch) {
    const players = altMatch[1]
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    return { enabled, players };
  }

  return { enabled, players: [] };
}

/**
 * Parse operator list response
 * Response formats vary by server type
 * @param {string} response
 * @returns {string[]}
 */
function parseOpList(response) {
  if (!response) {
    return [];
  }

  // Check for no ops
  if (response.includes('no ops') || response.includes('There are 0')) {
    return [];
  }

  // Try to extract from "There are X ops: player1, player2"
  const match = response.match(/:\s*(.+)$/);
  if (match) {
    return match[1]
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
  }

  // Some servers might return just the list
  if (!response.includes(':') && !response.includes('Unknown')) {
    return response
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
  }

  return [];
}

/**
 * Parse generic command response
 * @param {string} response
 * @param {string} command - Command that was executed (for context)
 * @returns {{success: boolean, message: string}}
 */
function parseCommandResponse(response, command) {
  if (!response) {
    return { success: true, message: '' };
  }

  const lowerResponse = response.toLowerCase();

  // Check for common error patterns
  const errorPatterns = [
    'unknown command',
    'no player was found',
    'player not found',
    'that player does not exist',
    'could not',
    'cannot',
    'failed',
    'error',
    'invalid',
    'not allowed',
    'no targets matched',
    'nothing changed',
  ];

  const isError = errorPatterns.some((pattern) => lowerResponse.includes(pattern));

  // Check for success patterns
  const successPatterns = [
    'added',
    'removed',
    'made',
    'set',
    'gave',
    'teleported',
    'kicked',
    'banned',
    'pardoned',
    'opped',
    'de-opped',
    'deopped',
    'enabled',
    'disabled',
    'saved',
    'reloaded',
  ];

  const isSuccess = successPatterns.some((pattern) => lowerResponse.includes(pattern));

  // If we found a success pattern, it's successful
  // If we found an error pattern without success, it's an error
  // Default to success if no patterns matched (some commands return empty)
  const success = isSuccess || !isError;

  return {
    success,
    message: response,
  };
}

/**
 * Parse seed response
 * Response: "Seed: [123456789]" or "Seed: 123456789"
 * @param {string} response
 * @returns {string}
 */
function parseSeed(response) {
  if (!response) return '';

  const match = response.match(/Seed:\s*\[?(-?\d+)\]?/i);
  return match ? match[1] : '';
}

/**
 * Parse time query response
 * Response: "The time is 1000"
 * @param {string} response
 * @returns {number}
 */
function parseTime(response) {
  if (!response) return 0;

  const match = response.match(/time is (\d+)/i);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Extract player name from various response formats
 * @param {string} text
 * @returns {string|null}
 */
function extractPlayerName(text) {
  if (!text) return null;

  // Try common patterns
  // "Player: Name"
  let match = text.match(/Player:\s*(\w+)/i);
  if (match) return match[1];

  // "Name joined the game"
  match = text.match(/(\w+) joined the game/i);
  if (match) return match[1];

  // "Name left the game"
  match = text.match(/(\w+) left the game/i);
  if (match) return match[1];

  return null;
}

module.exports = {
  parsePlayerList,
  parseWhitelist,
  parseOpList,
  parseCommandResponse,
  parseSeed,
  parseTime,
  extractPlayerName,
};
