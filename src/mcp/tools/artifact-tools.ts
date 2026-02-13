/**
 * Artifact management MCP tools
 * Per spec 03-mcp-server.md
 */

import Database from 'better-sqlite3';
import { Artifact } from '../../db/schema.js';
import { NotFoundError } from '../errors.js';
import { validateRequired, validatePositiveInteger } from '../validation.js';

export function artifactRegister(
  db: Database.Database,
  params: {
    task_id: number;
    artifact_type: string;
    file_path: string;
  }
): Artifact {
  validateRequired(params.task_id, 'task_id');
  validateRequired(params.artifact_type, 'artifact_type');
  validateRequired(params.file_path, 'file_path');
  validatePositiveInteger(params.task_id, 'task_id');

  // Verify task exists
  const task = db
    .prepare('SELECT id FROM tasks WHERE id = ?')
    .get(params.task_id);

  if (!task) {
    throw new NotFoundError(`Task ${params.task_id} not found`);
  }

  const now = new Date().toISOString();

  const result = db
    .prepare(
      `INSERT INTO artifacts (task_id, artifact_type, file_path, created_at)
       VALUES (?, ?, ?, ?)`
    )
    .run(params.task_id, params.artifact_type, params.file_path, now);

  const artifactId = result.lastInsertRowid as number;

  return db
    .prepare('SELECT * FROM artifacts WHERE id = ?')
    .get(artifactId) as Artifact;
}

export function artifactList(
  db: Database.Database,
  params: {
    task_id?: number;
    artifact_type?: string;
  }
): Artifact[] {
  const conditions: string[] = [];
  const values: any[] = [];

  if (params.task_id !== undefined) {
    validatePositiveInteger(params.task_id, 'task_id');
    conditions.push('task_id = ?');
    values.push(params.task_id);
  }

  if (params.artifact_type) {
    conditions.push('artifact_type = ?');
    values.push(params.artifact_type);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  return db
    .prepare(`SELECT * FROM artifacts ${whereClause} ORDER BY created_at DESC`)
    .all(...values) as Artifact[];
}
