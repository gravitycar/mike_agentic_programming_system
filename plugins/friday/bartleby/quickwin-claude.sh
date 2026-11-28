#!/bin/bash -l
# Friday's quick-win worker runs Claude through this, from the repo checkout.
# It adds MAPS's MCP server for this repo; the login shell supplies the token.
set -euo pipefail
MCP=$(printf '{"mcpServers":{"maps":{"command":"/srv/quickwin/maps/bin/maps-server.sh","args":["%s"]}}}' "$PWD")
exec claude --mcp-config "$MCP" "$@"
