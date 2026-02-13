/**
 * Config management MCP tools
 * Per spec 03-mcp-server.md
 */

import Database from 'better-sqlite3';
import { Config } from '../../db/schema.js';
import { NotFoundError } from '../errors.js';
import { validateRequired } from '../validation.js';

export function configSet(
  db: Database.Database,
  params: {
    key: string;
    value: string;
  }
): Config {
  validateRequired(params.key, 'key');
  validateRequired(params.value, 'value');

  const now = new Date().toISOString();

  // Use INSERT OR REPLACE for upsert behavior
  db.prepare(
    `INSERT OR REPLACE INTO config (key, value, updated_at)
     VALUES (?, ?, ?)`
  ).run(params.key, params.value, now);

  return db
    .prepare('SELECT * FROM config WHERE key = ?')
    .get(params.key) as Config;
}

export function configGet(
  db: Database.Database,
  params: {
    key: string;
  }
): Config {
  validateRequired(params.key, 'key');

  const config = db
    .prepare('SELECT * FROM config WHERE key = ?')
    .get(params.key) as Config | undefined;

  if (!config) {
    throw new NotFoundError(`Config key "${params.key}" not found`);
  }

  return config;
}
