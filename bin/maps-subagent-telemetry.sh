#!/usr/bin/env bash
#
# MAPS SubagentStop telemetry hook launcher.
#
# Change into the MAPS repo before running node, so the version manager (asdf,
# nvm, etc.) resolves the node pinned by THIS repo's .tool-versions, matching
# the node dist/hooks/subagent-telemetry.js (and its better-sqlite3 native
# binding) was built against — same reasoning as bin/maps-server.sh.
#
# .claude/settings.json's SubagentStop hook invokes this by its MAPS_DIR-
# absolute path directly; nothing is copied into the target project.
#
set -e
cd "$(dirname "$0")/.."
exec node dist/hooks/subagent-telemetry.js "$@"
