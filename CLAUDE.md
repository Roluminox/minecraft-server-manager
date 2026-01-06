# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Minecraft Server Manager - Electron desktop application to manage a Minecraft server running in Docker. Uses the `itzg/minecraft-server` Docker image.

## Commands

```bash
# Development (runs Vite UI + Electron concurrently)
npm run dev

# Build
npm run build:ui      # Build React UI
npm run build:electron # Package Electron app

# Linting
npm run lint

# Tests (core module only)
npm run test -w core
```

## Architecture

```
app/
├── core/           # Pure Node.js library (no Electron deps)
│   ├── docker/     # Docker detection, compose CLI, logs, stats
│   ├── rcon/       # RCON client + commands (whitelist, ops, kick)
│   ├── backup/     # Backup via alpine helper container
│   ├── config/     # .env manager + config schema
│   ├── server/     # Readiness checker (port + logs)
│   ├── events/     # Event logger
│   └── utils/      # Retry, logger utilities
├── electron/       # Main process
│   ├── main.js     # Window creation, security config
│   ├── preload.js  # Context bridge API
│   └── ipc-handlers.js  # IPC bridge to core (includes rate limiting)
└── ui/             # React + Vite + Tailwind
    └── src/components/  # DockerStatus, Console, ServerControls, etc.
```

### Key Patterns

**Docker Compose via CLI**: `compose.js` uses `spawn("docker", ["compose", ...])` since dockerode doesn't support Docker Compose natively. Container ID is resolved via labels for logs/stats.

**RCON with auto-reconnect**: `RconClient` implements connection queue, heartbeat, and automatic reconnection. Commands validated via `RconCommands` class.

**IPC Security**: All console commands rate-limited (5/sec), validated, and sanitized in `ipc-handlers.js`.

**Paths centralization**: All paths (data dir, backups, logs) managed through `Paths` class in `core/paths.js`.

**Backup strategy**: Uses ephemeral alpine container with mounted volumes to run tar (avoids Windows tar/gzip issues).

## Configuration

Server config managed via `.env` file. Schema defined in `core/config/schema.js` with validation. Key variables:
- `MC_VERSION`, `MC_TYPE`, `MC_MEMORY`, `MC_MAX_PLAYERS`
- `RCON_PASSWORD` (required for console commands)

## Docker Setup

The app expects Docker Desktop running. RCON port (25575) bound to localhost only for security. Minecraft port (25565) exposed for LAN/Tailscale access.

## Roadmap Reference

See `ROADMAP.md` for version scope:
- **V0**: MVP Dashboard (current - ~95% complete)
- **V1**: Players + Backups (in progress - ~60% complete)
- **V2**: Mods + Automation (planned)
