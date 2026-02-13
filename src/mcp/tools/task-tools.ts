/**
 * Task management MCP tools
 * Per spec 03-mcp-server.md
 */

import Database from 'better-sqlite3';
import { Task, TaskType, TaskStatus } from '../../db/schema.js';
import {
  ValidationError,
  NotFoundError,
  RuleViolationError,
  PreconditionError,
} from '../errors.js';
import {
  validateTaskType,
  validateTaskStatus,
  validateStatusTransition,
  validateRequired,
  validatePositiveInteger,
} from '../validation.js';

function getCurrentEpicId(db: Database.Database): number {
  const config = db
    .prepare('SELECT value FROM config WHERE key = ?')
    .get('current_epic_id') as { value: string } | undefined;

  if (!config) {
    throw new PreconditionError(
      'current_epic_id not set. Use config_set to set the current epic before performing epic-scoped operations.'
    );
  }

  return parseInt(config.value, 10);
}

function isTaskInEpic(
  db: Database.Database,
  taskId: number,
  epicId: number
): boolean {
  // Walk up the parent chain to see if we reach the epic
  let currentId: number | null = taskId;

  while (currentId !== null) {
    if (currentId === epicId) {
      return true;
    }

    const task = db
      .prepare('SELECT parent_id FROM tasks WHERE id = ?')
      .get(currentId) as { parent_id: number | null } | undefined;

    if (!task) {
      return false;
    }

    currentId = task.parent_id;
  }

  return false;
}

export function taskCreate(
  db: Database.Database,
  params: {
    parent_id: number;
    type: string;
    name: string;
    description: string;
    agent: string;
  }
): Task {
  // Validate required params
  validateRequired(params.parent_id, 'parent_id');
  validateRequired(params.type, 'type');
  validateRequired(params.name, 'name');
  validateRequired(params.description, 'description');
  validateRequired(params.agent, 'agent');

  // Validate types
  const type = validateTaskType(params.type);
  validatePositiveInteger(params.parent_id, 'parent_id');

  // Verify parent exists
  const parent = db
    .prepare('SELECT id, type FROM tasks WHERE id = ?')
    .get(params.parent_id) as { id: number; type: string } | undefined;

  if (!parent) {
    throw new NotFoundError(`Parent task ${params.parent_id} not found`);
  }

  // Verify parent is in current epic
  const epicId = getCurrentEpicId(db);
  if (!isTaskInEpic(db, params.parent_id, epicId)) {
    throw new RuleViolationError(
      `Parent task ${params.parent_id} does not belong to current epic ${epicId}`
    );
  }

  const now = new Date().toISOString();

  // Check if there are any blockers for this task (even though it doesn't exist yet,
  // blockers might be pre-created). If blockers exist, status should be 'blocked',
  // otherwise 'open'.
  // For now, we'll default to 'open' since blockers are added after task creation.
  const status: TaskStatus = 'open';

  const result = db
    .prepare(
      `INSERT INTO tasks (parent_id, type, name, description, status, agent, results, created_at, updated_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL)`
    )
    .run(
      params.parent_id,
      type,
      params.name,
      params.description,
      status,
      params.agent,
      now,
      now
    );

  const taskId = result.lastInsertRowid as number;

  return taskGet(db, { task_id: taskId });
}

export function taskGet(
  db: Database.Database,
  params: { task_id: number }
): Task {
  validateRequired(params.task_id, 'task_id');
  validatePositiveInteger(params.task_id, 'task_id');

  const epicId = getCurrentEpicId(db);

  const task = db
    .prepare('SELECT * FROM tasks WHERE id = ?')
    .get(params.task_id) as Task | undefined;

  if (!task) {
    throw new NotFoundError(`Task ${params.task_id} not found`);
  }

  // Verify task belongs to current epic
  if (!isTaskInEpic(db, task.id, epicId)) {
    throw new NotFoundError(
      `Task ${params.task_id} not found in current epic ${epicId}`
    );
  }

  return task;
}

export function taskUpdate(
  db: Database.Database,
  params: {
    task_id: number;
    status?: string;
    name?: string;
    description?: string;
    agent?: string;
    results?: string;
  }
): Task {
  validateRequired(params.task_id, 'task_id');
  validatePositiveInteger(params.task_id, 'task_id');

  // At least one update param must be provided
  if (
    !params.status &&
    !params.name &&
    !params.description &&
    !params.agent &&
    !params.results
  ) {
    throw new ValidationError(
      'At least one of status, name, description, agent, or results must be provided'
    );
  }

  // Get current task
  const currentTask = taskGet(db, { task_id: params.task_id });

  // Validate status transition if status is being updated
  let newStatus: TaskStatus = currentTask.status;
  if (params.status) {
    newStatus = validateTaskStatus(params.status);
    validateStatusTransition(currentTask.status, newStatus, params.task_id);
  }

  // Build update query
  const updates: string[] = [];
  const values: any[] = [];

  if (params.status) {
    updates.push('status = ?');
    values.push(newStatus);
  }
  if (params.name) {
    updates.push('name = ?');
    values.push(params.name);
  }
  if (params.description) {
    updates.push('description = ?');
    values.push(params.description);
  }
  if (params.agent) {
    updates.push('agent = ?');
    values.push(params.agent);
  }
  if (params.results !== undefined) {
    updates.push('results = ?');
    values.push(params.results);
  }

  const now = new Date().toISOString();
  updates.push('updated_at = ?');
  values.push(now);

  // If status is being set to 'done', set completed_at
  if (newStatus === 'done' && currentTask.status !== 'done') {
    updates.push('completed_at = ?');
    values.push(now);
  }

  values.push(params.task_id);

  db.prepare(
    `UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`
  ).run(...values);

  // If task was marked done, cascade unblock
  if (newStatus === 'done' && currentTask.status !== 'done') {
    cascadeUnblock(db, params.task_id);
  }

  return taskGet(db, { task_id: params.task_id });
}

function cascadeUnblock(db: Database.Database, completedTaskId: number): void {
  // Find all tasks blocked by the completed task
  const dependents = db
    .prepare(
      'SELECT blocked_task_id FROM blockers WHERE blocked_by_task_id = ?'
    )
    .all(completedTaskId) as { blocked_task_id: number }[];

  for (const dep of dependents) {
    // Check if ALL blockers for this task are now done
    const remainingBlockers = db
      .prepare(
        `SELECT COUNT(*) as count FROM blockers
         INNER JOIN tasks ON blockers.blocked_by_task_id = tasks.id
         WHERE blockers.blocked_task_id = ? AND tasks.status != 'done'`
      )
      .get(dep.blocked_task_id) as { count: number };

    if (remainingBlockers.count === 0) {
      // All blockers resolved, unblock the task
      const now = new Date().toISOString();
      db.prepare(
        `UPDATE tasks SET status = 'open', updated_at = ? WHERE id = ?`
      ).run(now, dep.blocked_task_id);
    }
  }
}

export function taskList(
  db: Database.Database,
  params: {
    status?: string;
    type?: string;
    parent_id?: number;
    agent?: string;
  }
): Task[] {
  const epicId = getCurrentEpicId(db);

  // Build query with filters
  const conditions: string[] = [];
  const values: any[] = [];

  if (params.status) {
    const status = validateTaskStatus(params.status);
    conditions.push('status = ?');
    values.push(status);
  }

  if (params.type) {
    const type = validateTaskType(params.type);
    conditions.push('type = ?');
    values.push(type);
  }

  if (params.parent_id !== undefined) {
    validatePositiveInteger(params.parent_id, 'parent_id');
    conditions.push('parent_id = ?');
    values.push(params.parent_id);
  }

  if (params.agent) {
    conditions.push('agent = ?');
    values.push(params.agent);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const tasks = db
    .prepare(`SELECT * FROM tasks ${whereClause}`)
    .all(...values) as Task[];

  // Filter to only tasks in current epic
  return tasks.filter((task) => isTaskInEpic(db, task.id, epicId));
}

export function nextTask(
  db: Database.Database,
  params: { agent?: string }
): Task | null {
  const epicId = getCurrentEpicId(db);

  // Find all open tasks in the current epic
  const openTasks = taskList(db, { status: 'open', agent: params.agent });

  // Return the first one (or null if none)
  return openTasks.length > 0 ? openTasks[0] : null;
}
