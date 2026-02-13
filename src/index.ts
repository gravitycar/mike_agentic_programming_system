#!/usr/bin/env node
/**
 * MAPS MCP Server Entry Point
 *
 * Usage: node dist/index.js <project_path>
 */

import { MapsServer } from './mcp/server.js';

async function main() {
  const projectPath = process.argv[2];

  if (!projectPath) {
    console.error('Usage: node dist/index.js <project_path>');
    process.exit(1);
  }

  const server = new MapsServer();

  // Initialize database with project path
  server.initDatabase(projectPath);

  await server.run();
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
