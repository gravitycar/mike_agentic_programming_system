/**
 * Epic management MCP tools
 * Per spec 03-mcp-server.md
 */

import Database from 'better-sqlite3';
import { Task } from '../../db/schema.js';

export function epicList(
  db: Database.Database,
  params: {
    active_only?: boolean;
  }
): Task[] {
  const activeOnly = params.active_only !== undefined ? params.active_only : false;

  if (activeOnly) {
    return db
      .prepare(`SELECT * FROM tasks WHERE type = 'epic' AND status != 'done'`)
      .all() as Task[];
  } else {
    return db
      .prepare(`SELECT * FROM tasks WHERE type = 'epic'`)
      .all() as Task[];
  }
}
