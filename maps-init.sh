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

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node --version)
echo -e "${GREEN}✓${NC} Node.js $NODE_VERSION"

# Check for npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm is not installed${NC}"
    exit 1
fi

NPM_VERSION=$(npm --version)
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

# Copy agent personas
echo -e "${BLUE}Copying agent personas...${NC}"

cp "$MAPS_DIR/.claude/agents/researcher.md" "$PROJECT_DIR/.claude/agents/"
echo -e "${GREEN}✓${NC} Copied researcher.md"

cp "$MAPS_DIR/.claude/agents/architect.md" "$PROJECT_DIR/.claude/agents/"
echo -e "${GREEN}✓${NC} Copied architect.md"

cp "$MAPS_DIR/.claude/agents/developer.md" "$PROJECT_DIR/.claude/agents/"
echo -e "${GREEN}✓${NC} Copied developer.md"

cp "$MAPS_DIR/.claude/agents/critic.md" "$PROJECT_DIR/.claude/agents/"
echo -e "${GREEN}✓${NC} Copied critic.md"

cp "$MAPS_DIR/.claude/agents/test-writer.md" "$PROJECT_DIR/.claude/agents/"
echo -e "${GREEN}✓${NC} Copied test-writer.md"

cp "$MAPS_DIR/.claude/agents/reviser.md" "$PROJECT_DIR/.claude/agents/"
echo -e "${GREEN}✓${NC} Copied reviser.md"

# Copy /maps command
echo -e "${BLUE}Copying /maps command...${NC}"

cp "$MAPS_DIR/.claude/commands/maps.md" "$PROJECT_DIR/.claude/commands/"
echo -e "${GREEN}✓${NC} Copied maps.md"

# Copy guidelines
echo -e "${BLUE}Copying specification guidelines...${NC}"

mkdir -p "$PROJECT_DIR/.maps/guidelines"
cp "$MAPS_DIR/docs/guidelines/SPECIFICATION_GUIDELINES.md" "$PROJECT_DIR/.maps/guidelines/"
echo -e "${GREEN}✓${NC} Copied SPECIFICATION_GUIDELINES.md"

cp "$MAPS_DIR/docs/guidelines/IMPLEMENTATION_PLAN_GUIDELINES.md" "$PROJECT_DIR/.maps/guidelines/"
echo -e "${GREEN}✓${NC} Copied IMPLEMENTATION_PLAN_GUIDELINES.md"

# Handle .mcp.json - merge, don't overwrite
echo -e "${BLUE}Configuring MCP server...${NC}"

MCP_JSON="$PROJECT_DIR/.mcp.json"

# Create the MAPS MCP server entry
MAPS_ENTRY=$(cat <<EOF
    "maps": {
      "command": "node",
      "args": [
        "$MAPS_DIR/dist/index.js",
        "$PROJECT_DIR"
      ]
    }
EOF
)

if [ -f "$MCP_JSON" ]; then
    echo -e "${YELLOW}Existing .mcp.json found${NC}"

    # Check if MAPS entry already exists
    if grep -q '"maps"' "$MCP_JSON"; then
        echo -e "${YELLOW}MAPS entry already exists in .mcp.json, updating...${NC}"

        # Create a backup
        cp "$MCP_JSON" "$MCP_JSON.backup"
        echo -e "${GREEN}✓${NC} Created backup at .mcp.json.backup"

        # Use Python to update the JSON (more reliable than sed for JSON)
        python3 - <<PYTHON_SCRIPT
import json
import sys

with open('$MCP_JSON', 'r') as f:
    config = json.load(f)

if 'mcpServers' not in config:
    config['mcpServers'] = {}

config['mcpServers']['maps'] = {
    'command': 'node',
    'args': [
        '$MAPS_DIR/dist/index.js',
        '$PROJECT_DIR'
    ]
}

with open('$MCP_JSON', 'w') as f:
    json.dump(config, f, indent=2)
    f.write('\n')

print('Updated MAPS entry in .mcp.json')
PYTHON_SCRIPT

        echo -e "${GREEN}✓${NC} Updated MAPS entry in .mcp.json"
    else
        echo -e "${YELLOW}Merging MAPS entry into existing .mcp.json...${NC}"

        # Create a backup
        cp "$MCP_JSON" "$MCP_JSON.backup"
        echo -e "${GREEN}✓${NC} Created backup at .mcp.json.backup"

        # Use Python to merge
        python3 - <<PYTHON_SCRIPT
import json
import sys

with open('$MCP_JSON', 'r') as f:
    config = json.load(f)

if 'mcpServers' not in config:
    config['mcpServers'] = {}

config['mcpServers']['maps'] = {
    'command': 'node',
    'args': [
        '$MAPS_DIR/dist/index.js',
        '$PROJECT_DIR'
    ]
}

with open('$MCP_JSON', 'w') as f:
    json.dump(config, f, indent=2)
    f.write('\n')

print('Merged MAPS entry into .mcp.json')
PYTHON_SCRIPT

        echo -e "${GREEN}✓${NC} Merged MAPS entry into .mcp.json"
    fi
else
    echo -e "${YELLOW}No .mcp.json found, creating new one...${NC}"

    cat > "$MCP_JSON" <<EOF
{
  "mcpServers": {
    "maps": {
      "command": "node",
      "args": [
        "$MAPS_DIR/dist/index.js",
        "$PROJECT_DIR"
      ]
    }
  }
}
EOF

    echo -e "${GREEN}✓${NC} Created .mcp.json with MAPS configuration"
fi

# Add .maps to .gitignore if it exists
if [ -f "$PROJECT_DIR/.gitignore" ]; then
    if ! grep -q "^\.maps/$" "$PROJECT_DIR/.gitignore"; then
        echo -e "${BLUE}Adding .maps/ to .gitignore...${NC}"
        echo "" >> "$PROJECT_DIR/.gitignore"
        echo "# MAPS working directory" >> "$PROJECT_DIR/.gitignore"
        echo ".maps/" >> "$PROJECT_DIR/.gitignore"
        echo -e "${GREEN}✓${NC} Added .maps/ to .gitignore"
    else
        echo -e "${YELLOW}.maps/ already in .gitignore${NC}"
    fi
else
    echo -e "${YELLOW}No .gitignore found, creating one...${NC}"
    cat > "$PROJECT_DIR/.gitignore" <<EOF
# MAPS working directory
.maps/
EOF
    echo -e "${GREEN}✓${NC} Created .gitignore with .maps/"
fi

# Verify MAPS server is built
if [ ! -f "$MAPS_DIR/dist/index.js" ]; then
    echo ""
    echo -e "${YELLOW}Warning: MAPS MCP server not built${NC}"
    echo "Building MAPS MCP server..."
    cd "$MAPS_DIR"
    npm install
    npm run build
    cd "$PROJECT_DIR"
    echo -e "${GREEN}✓${NC} MAPS MCP server built"
fi

# Summary
echo ""
echo -e "${GREEN}=================================================="
echo "MAPS Setup Complete!"
echo "==================================================${NC}"
echo ""
echo "What was installed:"
echo "  • Agent personas → .claude/agents/"
echo "  • /maps command → .claude/commands/"
echo "  • Guidelines → .maps/guidelines/"
echo "  • MCP configuration → .mcp.json"
echo "  • Working directory → .maps/"
echo ""
echo "Next steps:"
echo "  1. Restart Claude Code to load the MCP server"
echo "  2. In Claude Code, type: /maps <your problem description>"
echo "  3. MAPS will guide you through the workflow"
echo ""
echo -e "${BLUE}Example:${NC}"
echo "  /maps I want to build a user authentication system with JWT tokens"
echo ""
echo "Documentation:"
echo "  • Specification guidelines: .maps/guidelines/SPECIFICATION_GUIDELINES.md"
echo "  • Implementation plan guidelines: .maps/guidelines/IMPLEMENTATION_PLAN_GUIDELINES.md"
echo "  • MAPS overview: $MAPS_DIR/CLAUDE.md"
echo ""
echo -e "${GREEN}Happy building with MAPS!${NC}"
