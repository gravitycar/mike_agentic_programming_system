#!/bin/bash
#
# MAPS Setup Script
# Initializes a project to use Mike's Agentic Programming System
#
# Usage: cd /path/to/your/project && /path/to/maps/maps-init.sh
#

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the directory where this script is located (MAPS installation directory)
MAPS_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Target project directory is current working directory
PROJECT_DIR="$(pwd)"

echo -e "${BLUE}MAPS Setup - Mike's Agentic Programming System${NC}"
echo "=================================================="
echo ""
echo "MAPS directory: $MAPS_DIR"
echo "Target project: $PROJECT_DIR"
echo ""

# Check prerequisites
echo -e "${BLUE}Checking prerequisites...${NC}"

# Check for Node.js. The MAPS server runs under the node pinned by the MAPS
# repo (.tool-versions), via the launcher bin/maps-server.sh. So check node in
# the MAPS directory, not in the target project. This decouples MAPS from
# whatever node the target project pins.
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

if ! NODE_VERSION=$( cd "$MAPS_DIR" && node --version 2>&1 ); then
    echo -e "${RED}Error: MAPS's pinned node version is not available.${NC}"
    echo "  $NODE_VERSION"
    echo "MAPS pins its node in $MAPS_DIR/.tool-versions."
    echo "Install that version (for example: asdf install nodejs <version>) and re-run."
    exit 1
fi
echo -e "${GREEN}✓${NC} Node.js $NODE_VERSION (MAPS runtime)"

# Check for npm (bundled with node, resolved in the MAPS directory)
if ! NPM_VERSION=$( cd "$MAPS_DIR" && npm --version 2>&1 ); then
    echo -e "${RED}Error: npm is not available under MAPS's node${NC}"
    echo "  $NPM_VERSION"
    exit 1
fi
echo -e "${GREEN}✓${NC} npm $NPM_VERSION"

# Check for Claude Code (optional check - just warn)
if ! command -v claude &> /dev/null; then
    echo -e "${YELLOW}Warning: Claude Code CLI not found in PATH${NC}"
    echo "MAPS requires Claude Code to run. Install from: https://claude.ai/download"
else
    echo -e "${GREEN}✓${NC} Claude Code CLI found"
fi

echo ""

# Create .claude directory structure
echo -e "${BLUE}Setting up .claude directory structure...${NC}"

mkdir -p "$PROJECT_DIR/.claude/agents"
mkdir -p "$PROJECT_DIR/.claude/commands"
echo -e "${GREEN}✓${NC} Created .claude/agents/"
echo -e "${GREEN}✓${NC} Created .claude/commands/"

# Create .maps directory structure
echo -e "${BLUE}Setting up .maps directory structure...${NC}"

mkdir -p "$PROJECT_DIR/.maps/docs"
echo -e "${GREEN}✓${NC} Created .maps/"
echo -e "${GREEN}✓${NC} Created .maps/docs/"

# Copy every agent persona, command, and guideline by looping over the
# source directories. This picks up new files automatically. Add a new
# agent or command to the MAPS repo and it installs with no edit here.

# Copy agent personas
echo -e "${BLUE}Copying agent personas...${NC}"
for f in "$MAPS_DIR/.claude/agents/"*.md; do
    [ -e "$f" ] || continue
    cp "$f" "$PROJECT_DIR/.claude/agents/"
    echo -e "${GREEN}✓${NC} Copied $(basename "$f")"
done

# Copy commands (maps, maps-lite, mr-maps, and any future variants)
echo -e "${BLUE}Copying commands...${NC}"
for f in "$MAPS_DIR/.claude/commands/"*.md; do
    [ -e "$f" ] || continue
    cp "$f" "$PROJECT_DIR/.claude/commands/"
    echo -e "${GREEN}✓${NC} Copied $(basename "$f")"
done

# Copy guidelines
echo -e "${BLUE}Copying guidelines...${NC}"
mkdir -p "$PROJECT_DIR/.maps/guidelines"
for f in "$MAPS_DIR/docs/guidelines/"*.md; do
    [ -e "$f" ] || continue
    cp "$f" "$PROJECT_DIR/.maps/guidelines/"
    echo -e "${GREEN}✓${NC} Copied $(basename "$f")"
done

# Handle .mcp.json - merge, don't overwrite.
# Uses node (already a hard prerequisite) rather than python3, so this does not
# depend on a second runtime. A missing/unset python3 is what silently skipped
# this step before.
echo -e "${BLUE}Configuring MCP server...${NC}"

MCP_JSON="$PROJECT_DIR/.mcp.json"

# Back up an existing file before touching it
if [ -f "$MCP_JSON" ]; then
    echo -e "${YELLOW}Existing .mcp.json found${NC}"
    cp "$MCP_JSON" "$MCP_JSON.backup"
    echo -e "${GREEN}✓${NC} Created backup at .mcp.json.backup"
fi

# Merge (or create) the MAPS entry with node. Paths pass through the environment
# to avoid any quoting issues. Other mcpServers entries are preserved.
( cd "$MAPS_DIR" && MCP_JSON="$MCP_JSON" MAPS_DIR="$MAPS_DIR" PROJECT_DIR="$PROJECT_DIR" node <<'NODE'
const fs = require('fs');
const file = process.env.MCP_JSON;

let config = {};
if (fs.existsSync(file)) {
  const raw = fs.readFileSync(file, 'utf8').trim();
  if (raw) {
    try {
      config = JSON.parse(raw);
    } catch (e) {
      console.error('ERROR: existing .mcp.json is not valid JSON. It was left untouched (backup at .mcp.json.backup).');
      console.error('  ' + e.message);
      process.exit(1);
    }
  }
}

if (typeof config.mcpServers !== 'object' || config.mcpServers === null) {
  config.mcpServers = {};
}

const existed = Object.prototype.hasOwnProperty.call(config.mcpServers, 'maps');
config.mcpServers.maps = {
  command: process.env.MAPS_DIR + '/bin/maps-server.sh',
  args: [process.env.PROJECT_DIR],
};

fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
console.log(existed ? 'Updated MAPS entry in .mcp.json' : 'Wrote MAPS entry to .mcp.json');
NODE
)

echo -e "${GREEN}✓${NC} MAPS MCP server configured in .mcp.json"

# Add .maps/maps.db to .gitignore (track docs, ignore database)
if [ -f "$PROJECT_DIR/.gitignore" ]; then
    if ! grep -q "^\.maps/maps\.db$" "$PROJECT_DIR/.gitignore"; then
        echo -e "${BLUE}Adding .maps/maps.db to .gitignore...${NC}"
        echo "" >> "$PROJECT_DIR/.gitignore"
        echo "# MAPS database (docs are tracked)" >> "$PROJECT_DIR/.gitignore"
        echo ".maps/maps.db" >> "$PROJECT_DIR/.gitignore"
        echo -e "${GREEN}✓${NC} Added .maps/maps.db to .gitignore"
    else
        echo -e "${YELLOW}.maps/maps.db already in .gitignore${NC}"
    fi
else
    echo -e "${YELLOW}No .gitignore found, creating one...${NC}"
    cat > "$PROJECT_DIR/.gitignore" <<EOF
# MAPS database (docs are tracked)
.maps/maps.db
EOF
    echo -e "${GREEN}✓${NC} Created .gitignore with .maps/maps.db"
fi

# Make the launcher executable. Git usually preserves this bit, but be safe.
chmod +x "$MAPS_DIR/bin/maps-server.sh" 2>/dev/null || true

# Verify the MAPS server is built. Build under MAPS's own node (the subshell cd
# picks up MAPS's .tool-versions) so the native better-sqlite3 module matches
# the node the launcher runs. npm install fetches a prebuilt binary, so this
# does not need a C/C++ toolchain or python.
if [ ! -f "$MAPS_DIR/dist/index.js" ]; then
    echo ""
    echo -e "${YELLOW}MAPS MCP server not built, building...${NC}"
    ( cd "$MAPS_DIR" && npm install && npm run build )
    echo -e "${GREEN}✓${NC} MAPS MCP server built"
fi

# Summary
echo ""
echo -e "${GREEN}=================================================="
echo "MAPS Setup Complete!"
echo -e "==================================================${NC}"
echo ""
echo "What was installed:"
echo "  • Agent personas → .claude/agents/"
echo "  • Commands (maps, maps-lite, mr-maps) → .claude/commands/"
echo "  • Guidelines → .maps/guidelines/"
echo "  • MCP configuration → .mcp.json (runs via bin/maps-server.sh)"
echo "  • Working directory → .maps/"
echo ""
echo "The MCP server runs under the node pinned in the MAPS repo's"
echo ".tool-versions ($NODE_VERSION), regardless of this project's node."
echo ""
echo "Next steps:"
echo "  1. Restart Claude Code to load the MCP server"
echo "  2. Run /mcp and confirm 'maps' shows connected"
echo "  3. In Claude Code, type: /maps <your problem description>"
echo ""
echo -e "${BLUE}Example:${NC}"
echo "  /maps I want to build a user authentication system with JWT tokens"
echo ""
echo -e "${YELLOW}If /mcp reports a 'maps' scope conflict:${NC}"
echo "  An old 'maps' entry in another scope can shadow this one and fail."
echo "  Keep this project entry and remove the other, for example:"
echo "  claude mcp remove maps -s local"
echo ""
echo -e "${YELLOW}Note for mr-maps (MetaRouter) users:${NC}"
echo "  • mr-maps needs the Shortcut MCP server. A read-capable one is required."
echo "    A write-capable one lets mr-maps create epics and stories for you."
echo "  • mr-maps commits documents to docs/plans/sc-<epic#>/ and treats all of"
echo "    .maps/ as internal scratch. Gitignore the whole .maps/ directory"
echo "    instead of just .maps/maps.db."
echo "  • Start it with: /mr-maps <problem statement for a Shortcut epic>"
echo ""
echo "Documentation:"
echo "  • Specification guidelines: .maps/guidelines/SPECIFICATION_GUIDELINES.md"
echo "  • Implementation plan guidelines: .maps/guidelines/IMPLEMENTATION_PLAN_GUIDELINES.md"
echo "  • MAPS overview: $MAPS_DIR/CLAUDE.md"
echo ""
echo -e "${GREEN}Happy building with MAPS!${NC}"
