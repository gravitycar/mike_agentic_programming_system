/**
 * Project initialization MCP tool
 * Per spec 03-mcp-server.md and 08-project-setup.md
 */

import * as fs from 'fs';
import * as path from 'path';

export function projectInit(params: {
  project_path: string;
}): { success: true; paths_created: string[] } {
  const projectPath = params.project_path;
  const pathsCreated: string[] = [];

  const mapsDir = path.join(projectPath, '.maps');
  const docsDir = path.join(mapsDir, 'docs');

  // Create .maps directory
  if (!fs.existsSync(mapsDir)) {
    fs.mkdirSync(mapsDir, { recursive: true });
    pathsCreated.push(mapsDir);
  }

  // Create .maps/docs directory
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
    pathsCreated.push(docsDir);
  }

  // Database will be created by MapsDatabase constructor

  return { success: true, paths_created: pathsCreated };
}
