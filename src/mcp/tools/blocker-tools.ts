/**
 * Blocker management MCP tools
 * Per spec 03-mcp-server.md
 */

import Database from 'better-sqlite3';
import { Blocker } from '../../db/schema.js';
import {
  ValidationError,
  NotFoundError,
  RuleViolationError,
} from '../errors.js';
import { validateRequired, validatePositiveInteger } from '../validation.js';

function detectCircularDependency(
  db: Database.Database,
  blockedTaskId: number,
  blockedByTaskId: number
): boolean {
  // Use BFS to check if adding this blocker would create a cycle
  // A cycle exists if we can reach blockedByTaskId by following the blocker chain from blockedTaskId

  const visited = new Set<number>();
  const queue: number[] = [blockedTaskId];

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current === blockedByTaskId) {
      return true; // Cycle detected
    }

    if (visited.has(current)) {
      continue;
    }
    visited.add(current);

    // Find all tasks that current blocks
    const blocked = db
      .prepare('SELECT blocked_task_id FROM blockers WHERE blocked_by_task_id = ?')
      .all(current) as { blocked_task_id: number }[];

    for (const b of blocked) {
      queue.push(b.blocked_task_id);
    }
  }

  return false;
}

export function blockerAdd(
  db: Database.Database,
  params: {
    blocked_task_id: number;
    blocked_by_task_id: number;
  }
): Blocker {
  validateRequired(params.blocked_task_id, 'blocked_task_id');
  validateRequired(params.blocked_by_task_id, 'blocked_by_task_id');
  validatePositiveInteger(params.blocked_task_id, 'blocked_task_id');
  validatePositiveInteger(params.blocked_by_task_id, 'blocked_by_task_id');

  if (params.blocked_task_id === params.blocked_by_task_id) {
    throw new ValidationError('A task cannot block itself');
  }

  // Verify both tasks exist
  const blockedTask = db
    .prepare('SELECT id FROM tasks WHERE id = ?')
    .get(params.blocked_task_id);
  const blockedByTask = db
    .prepare('SELECT id FROM tasks WHERE id = ?')
    .get(params.blocked_by_task_id);

  if (!blockedTask) {
    throw new NotFoundError(`Task ${params.blocked_task_id} not found`);
  }
  if (!blockedByTask) {
    throw new NotFoundError(`Task ${params.blocked_by_task_id} not found`);
  }

  // Check for circular dependencies
  if (detectCircularDependency(db, params.blocked_task_id, params.blocked_by_task_id)) {
    throw new RuleViolationError(
      `Cannot add blocker: would create circular dependency between tasks ${params.blocked_task_id} and ${params.blocked_by_task_id}`
    );
  }

  const now = new Date().toISOString();

  // Insert blocker (UNIQUE constraint handles duplicate prevention)
  try {
    const result = db
      .prepare(
        `INSERT INTO blockers (blocked_task_id, blocked_by_task_id, created_at, updated_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(params.blocked_task_id, params.blocked_by_task_id, now, now);

    // Automatically set blocked task to 'blocked' status
    db.prepare(
      `UPDATE tasks SET status = 'blocked', updated_at = ? WHERE id = ?`
    ).run(now, params.blocked_task_id);

    const blockerId = result.lastInsertRowid as number;

    return db
      .prepare('SELECT * FROM blockers WHERE id = ?')
      .get(blockerId) as Blocker;
  } catch (error: any) {
    if (error.message && error.message.includes('UNIQUE constraint failed')) {
      throw new ValidationError(
        `Blocker already exists: task ${params.blocked_task_id} is already blocked by task ${params.blocked_by_task_id}`
      );
    }
    throw error;
  }
}

export function blockerRemove(
  db: Database.Database,
  params: {
    blocked_task_id: number;
    blocked_by_task_id: number;
  }
): { success: true } {
  validateRequired(params.blocked_task_id, 'blocked_task_id');
  validateRequired(params.blocked_by_task_id, 'blocked_by_task_id');
  validatePositiveInteger(params.blocked_task_id, 'blocked_task_id');
  validatePositiveInteger(params.blocked_by_task_id, 'blocked_by_task_id');

  const result = db
    .prepare(
      `DELETE FROM blockers WHERE blocked_task_id = ? AND blocked_by_task_id = ?`
    )
    .run(params.blocked_task_id, params.blocked_by_task_id);

  if (result.changes === 0) {
    throw new NotFoundError(
      `Blocker not found: task ${params.blocked_task_id} blocked by task ${params.blocked_by_task_id}`
    );
  }

  // Check if this was the last blocker for the blocked task
  const remainingBlockers = db
    .prepare(
      `SELECT COUNT(*) as count FROM blockers
       INNER JOIN tasks ON blockers.blocked_by_task_id = tasks.id
       WHERE blockers.blocked_task_id = ? AND tasks.status != 'done'`
    )
    .get(params.blocked_task_id) as { count: number };

  // If no remaining unresolved blockers, unblock the task
  if (remainingBlockers.count === 0) {
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE tasks SET status = 'open', updated_at = ? WHERE id = ? AND status = 'blocked'`
    ).run(now, params.blocked_task_id);
  }

  return { success: true };
}

export function blockerDependencies(
  db: Database.Database,
  params: { task_id: number }
): Blocker[] {
  validateRequired(params.task_id, 'task_id');
  validatePositiveInteger(params.task_id, 'task_id');

  return db
    .prepare(
      `SELECT * FROM blockers WHERE blocked_task_id = ?`
    )
    .all(params.task_id) as Blocker[];
}

export function blockerDependents(
  db: Database.Database,
  params: { task_id: number }
): Blocker[] {
  validateRequired(params.task_id, 'task_id');
  validatePositiveInteger(params.task_id, 'task_id');

  return db
    .prepare(
      `SELECT * FROM blockers WHERE blocked_by_task_id = ?`
    )
    .all(params.task_id) as Blocker[];
}
