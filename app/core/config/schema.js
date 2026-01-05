/**
 * Configuration schema for Minecraft server settings
 * Defines validation, types, and mapping between UI and config files
 */

const ConfigSchema = {
  // === Minecraft Version & Type (ENV) ===

  'mc.version': {
    envVar: 'VERSION',
    type: 'select',
    label: 'Minecraft Version',
    description: 'Minecraft server version',
    options: ['LATEST', '1.21.5', '1.21.4', '1.21.3', '1.20.4', '1.20.2', '1.19.4'],
    default: 'LATEST',
    validate: (v) => typeof v === 'string' && v.length > 0,
    requiresRestart: true
  },

  'mc.type': {
    envVar: 'TYPE',
    type: 'select',
    label: 'Server Type',
    description: 'Type of Minecraft server',
    options: ['VANILLA', 'PAPER', 'SPIGOT', 'FABRIC', 'FORGE', 'QUILT'],
    default: 'VANILLA',
    validate: (v) => ['VANILLA', 'PAPER', 'SPIGOT', 'FABRIC', 'FORGE', 'QUILT'].includes(v),
    requiresRestart: true
  },

  'mc.memory': {
    envVar: 'MEMORY',
    type: 'slider',
    label: 'Memory (RAM)',
    description: 'Memory allocated to the server',
    min: 1,
    max: 16,
    step: 1,
    unit: 'G',
    default: '4G',
    validate: (v) => /^\d+G$/.test(v) && parseInt(v) >= 1 && parseInt(v) <= 32,
    format: (v) => `${v}G`,
    parse: (v) => parseInt(v),
    requiresRestart: true
  },

  'mc.maxPlayers': {
    envVar: 'MAX_PLAYERS',
    type: 'number',
    label: 'Max Players',
    description: 'Maximum number of players',
    min: 1,
    max: 100,
    default: 10,
    validate: (v) => Number.isInteger(v) && v >= 1 && v <= 100,
    requiresRestart: false
  },

  // === RCON Settings (ENV) ===

  'rcon.enabled': {
    envVar: 'ENABLE_RCON',
    type: 'boolean',
    label: 'Enable RCON',
    description: 'Enable remote console access',
    default: true,
    validate: (v) => typeof v === 'boolean',
    requiresRestart: true
  },

  'rcon.password': {
    envVar: 'RCON_PASSWORD',
    type: 'password',
    label: 'RCON Password',
    description: 'Password for RCON access',
    default: '',
    validate: (v) => typeof v === 'string',
    requiresRestart: true,
    sensitive: true
  },

  // === Server Properties ===

  'server.motd': {
    target: 'server.properties',
    property: 'motd',
    type: 'text',
    label: 'MOTD',
    description: 'Message of the day shown in server list',
    maxLength: 59,
    default: 'A Minecraft Server',
    validate: (v) => typeof v === 'string' && v.length <= 59,
    requiresRestart: false
  },

  'server.difficulty': {
    target: 'server.properties',
    property: 'difficulty',
    type: 'select',
    label: 'Difficulty',
    description: 'Game difficulty',
    options: ['peaceful', 'easy', 'normal', 'hard'],
    default: 'normal',
    validate: (v) => ['peaceful', 'easy', 'normal', 'hard'].includes(v),
    requiresRestart: false
  },

  'server.gamemode': {
    target: 'server.properties',
    property: 'gamemode',
    type: 'select',
    label: 'Default Gamemode',
    description: 'Default gamemode for new players',
    options: ['survival', 'creative', 'adventure', 'spectator'],
    default: 'survival',
    validate: (v) => ['survival', 'creative', 'adventure', 'spectator'].includes(v),
    requiresRestart: false
  },

  'server.pvp': {
    target: 'server.properties',
    property: 'pvp',
    type: 'boolean',
    label: 'PvP',
    description: 'Allow player vs player combat',
    default: true,
    validate: (v) => typeof v === 'boolean',
    requiresRestart: false
  },

  'server.onlineMode': {
    target: 'server.properties',
    property: 'online-mode',
    type: 'boolean',
    label: 'Online Mode',
    description: 'Require Minecraft account authentication',
    default: true,
    validate: (v) => typeof v === 'boolean',
    requiresRestart: true
  },

  'server.seed': {
    target: 'server.properties',
    property: 'level-seed',
    type: 'text',
    label: 'World Seed',
    description: 'Seed for world generation (leave empty for random)',
    default: '',
    validate: (v) => typeof v === 'string',
    requiresRestart: true
  }
};

/**
 * Get schema for a config key
 * @param {string} key
 * @returns {object|null}
 */
function getSchema(key) {
  return ConfigSchema[key] || null;
}

/**
 * Get all config keys
 * @returns {string[]}
 */
function getAllKeys() {
  return Object.keys(ConfigSchema);
}

/**
 * Get config keys by target (env or server.properties)
 * @param {string} target - 'env' or 'server.properties'
 * @returns {string[]}
 */
function getKeysByTarget(target) {
  return Object.entries(ConfigSchema)
    .filter(([_, schema]) => {
      if (target === 'env') {
        return schema.envVar !== undefined;
      }
      return schema.target === target;
    })
    .map(([key]) => key);
}

/**
 * Validate a value against schema
 * @param {string} key
 * @param {any} value
 * @returns {{valid: boolean, error?: string}}
 */
function validate(key, value) {
  const schema = ConfigSchema[key];
  if (!schema) {
    return { valid: false, error: `Unknown config key: ${key}` };
  }

  if (schema.validate && !schema.validate(value)) {
    return { valid: false, error: `Invalid value for ${key}` };
  }

  return { valid: true };
}

/**
 * Get default value for a config key
 * @param {string} key
 * @returns {any}
 */
function getDefault(key) {
  const schema = ConfigSchema[key];
  return schema ? schema.default : null;
}

/**
 * Get all default values
 * @returns {object}
 */
function getAllDefaults() {
  const defaults = {};
  for (const [key, schema] of Object.entries(ConfigSchema)) {
    defaults[key] = schema.default;
  }
  return defaults;
}

module.exports = {
  ConfigSchema,
  getSchema,
  getAllKeys,
  getKeysByTarget,
  validate,
  getDefault,
  getAllDefaults
};
