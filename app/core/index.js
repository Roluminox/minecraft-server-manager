/**
 * @mcsm/core - Core library for Minecraft Server Manager
 *
 * Pure Node.js library with no Electron dependencies.
 * Can be used standalone for testing or in other contexts.
 */

const { Paths } = require('./paths');
const { DockerDetector, DockerState, NextAction } = require('./docker/detector');
const { ComposeManager } = require('./docker/compose');
const { LogsManager } = require('./docker/logs');
const { StatsManager } = require('./docker/stats');
const { RconClient } = require('./rcon/client');
const { ReadinessChecker } = require('./server/readiness');
const { EventLogger, EventType } = require('./events/logger');
const { EnvManager } = require('./config/env-manager');
const { ConfigSchema } = require('./config/schema');
const { withRetry, RetryConfig } = require('./utils/retry');
const { Logger } = require('./utils/logger');

module.exports = {
  // Paths
  Paths,

  // Docker
  DockerDetector,
  DockerState,
  NextAction,
  ComposeManager,
  LogsManager,
  StatsManager,

  // RCON
  RconClient,

  // Server
  ReadinessChecker,

  // Events
  EventLogger,
  EventType,

  // Config
  EnvManager,
  ConfigSchema,

  // Utils
  withRetry,
  RetryConfig,
  Logger
};
