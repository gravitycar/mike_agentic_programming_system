# MAPS Specification: Project Setup & Configuration

## Status: Draft

## Overview
MAPS is designed to be portable — usable from any project directory on the local system. This spec defines how a new project is configured to use MAPS, what files need to be in place, and how the MCP server discovers and initializes per-project resources.

## Context
From the initial design notes:

- MAPS lives in its own directory (e.g., `/Users/my_name/projects/MAPS`)
- Target projects live in separate directories (e.g., `/Users/my_name/projects/awesome_project`)
- The MCP server runs from the MAPS directory and communicates over stdio
- Agent definitions are markdown files copied into the target project's `.claude/` directory
- An `mcp.json` file in the target project tells Claude Code where to find the MCP server
- SQLite databases are per-project, created in the project's working directory
- The `.mcp.json` configuration provides the project path to the MCP server

## Prerequisites
- **Node.js** — for the MCP server
- **Claude Code** — for the user interface

No Python dependency.

## Setup Process
A setup script in the MAPS project directory (`maps-init.sh`) that the user runs from their target project directory. A single invocation handles everything:

1. **Create `.maps/` directory** — standard directory for all MAPS data within a target project (database at `.maps/maps.db`, artifact documents, etc.)
2. **Copy agent personas** into `.claude/agents/`
3. **Copy the `/maps` command** into `.claude/commands/maps.md`
4. **Copy specification guidelines** into `.maps/docs/`
5. **Update `.mcp.json`** — if an existing `.mcp.json` exists, parse it and append the MAPS MCP server entry to the `mcpServers` object, preserving all existing entries. If none exists, create a new `.mcp.json` with just the MAPS entry. The entry points to the MAPS MCP server entry point with the project path as a parameter.

### Version Updates
Re-run the setup script. It overwrites the `.claude/agents/` and `.claude/commands/` files with the latest versions from the MAPS project directory. The `.maps/` data (database, artifacts) is preserved. The `.mcp.json` entry is updated if needed.

### Idempotency
The setup script is safe to re-run. It overwrites command/agent files (picking up new versions), merges into `.mcp.json` without overwriting existing entries, and the `project_init` MCP tool is already defined as idempotent.

## Requirements
- Minimal setup steps for a new project
- Per-project database isolation
- Agent definitions and commands are portable via file copy
- MCP server configuration via standard `.mcp.json` (merged, never overwritten)
- Setup script must be idempotent — safe to re-run at any time

## Open Questions
1. ~~What is the exact setup process? A CLI command (`maps init`)? A manual checklist? A setup script?~~ **Resolved** — A setup script in the MAPS project directory (e.g., `maps-init.sh`) that the user runs from their target project directory. It copies the necessary files, creates the `.maps/` directory, and configures the MCP server. See also #5.
2. ~~What files need to be copied into `.claude/`? Just agent definitions, or also templates and guidelines?~~ **Resolved** — Agent persona files (into `.claude/agents/`), the `/maps` command (into `.claude/commands/maps.md`), and specification guidelines (into `.maps/docs/`). The `.mcp.json` file is updated (not copied) — see #4.
3. ~~Where exactly does the SQLite database file go? Project root? `.maps/` subdirectory?~~ **Resolved** — `.maps/` subdirectory (e.g., `.maps/maps.db`). See [01-db-schema.md](01-db-schema.md) open question #8.
4. ~~How does the `mcp.json` configuration look? What are the exact fields?~~ **Resolved** — The setup script checks for an existing `.mcp.json` in the target project. If one exists, it parses it and appends the MAPS MCP server entry to the `mcpServers` object, preserving all existing entries. If none exists, it creates a new `.mcp.json` with just the MAPS entry. The entry points to the MAPS MCP server entry point with the project path as a parameter, similar to the Agent Fabric pattern.
5. ~~Can setup be automated so a single command prepares a project for MAPS?~~ **Resolved** — Yes. The setup script (see #1) handles everything in a single invocation: creates `.maps/`, copies agent personas and commands into `.claude/`, and updates `.mcp.json`.
6. ~~How do we handle MAPS version updates — if agent definitions change, how do projects pick up the new versions?~~ **Resolved** — Re-run the setup script. It overwrites the `.claude/agents/` and `.claude/commands/` files with the latest versions from the MAPS project directory. The `.maps/` data (database, artifacts) is preserved. The `.mcp.json` entry is updated if needed.
7. ~~Should there be a `.maps/` directory convention in target projects for the database, documents, and configuration?~~ **Resolved** — Yes. `.maps/` is the standard directory for all MAPS data within a target project (database, artifact documents, etc.).
8. ~~What happens if a user runs MAPS in a directory that's already set up — is it idempotent?~~ **Resolved** — Yes. The setup script is safe to re-run. It overwrites command/agent files (picking up new versions), merges into `.mcp.json` without overwriting existing entries, and the `project_init` MCP tool is already defined as idempotent.
9. ~~Are there any system-level prerequisites (Python version, Node version, Claude Code version)?~~ **Resolved** — Node.js (for the MCP server) and Claude Code (for the user interface). No Python dependency.
10. ~~Should there be a validation/health-check command to verify a project is correctly configured?~~ **Resolved** — Not for v1. The setup script is simple enough that successful completion means the project is configured. A health check can be added later if a need emerges.

## Dependencies
- [03-mcp-server.md](03-mcp-server.md) — The MCP server is the core of the setup.
- [04-agents.md](04-agents.md) — Agent definitions are what gets copied to target projects.
