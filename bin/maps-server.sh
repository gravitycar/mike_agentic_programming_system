#!/usr/bin/env bash
#
# MAPS MCP server launcher.
#
# Change into the MAPS repo before running node, so the version manager (asdf,
# nvm, etc.) resolves the node pinned by THIS repo's .tool-versions, not the
# node pinned by the target project. This keeps the compiled better-sqlite3
# ABI matched to the node that runs the server, no matter what node the target
# project pins. It is what makes a single MAPS install portable across projects
# and machines.
#
# .mcp.json invokes this as: <MAPS_DIR>/bin/maps-server.sh <PROJECT_DIR>
#
set -e
cd "$(dirname "$0")/.."
exec node dist/index.js "$@"
