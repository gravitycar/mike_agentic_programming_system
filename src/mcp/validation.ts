/**
 * Input validation for MCP tools
 * Per spec 03-mcp-server.md
 */

import { TaskType, TaskStatus } from '../db/schema.js';
import { ValidationError } from './errors.js';

const VALID_TASK_TYPES: TaskType[] = [
  'epic',
  'research',
  'specification',
  'agent-review',
  'human-review',
  'catalog',
  'plan',
  'implement',
  'test',
  'question',
];

const VALID_TASK_STATUSES: TaskStatus[] = [
  'open',
  'in_progress',
  'blocked',
  'done',
  'deferred',
  'orphaned',
];

const VALID_STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  open: ['in_progress', 'blocked', 'deferred'],
  in_progress: ['done', 'deferred', 'orphaned'],
  blocked: ['open', 'deferred'],
  done: ['deferred'], // Can only move to deferred from done
  deferred: [], // Terminal state (can't transition out)
  orphaned: [], // Terminal state (can't transition out)
};

export function validateTaskType(type: string): TaskType {
  if (!VALID_TASK_TYPES.includes(type as TaskType)) {
    throw new ValidationError(
      `Invalid task type "${type}". Must be one of: ${VALID_TASK_TYPES.join(', ')}`
    );
  }
  return type as TaskType;
}

export function validateTaskStatus(status: string): TaskStatus {
  if (!VALID_TASK_STATUSES.includes(status as TaskStatus)) {
    throw new ValidationError(
      `Invalid task status "${status}". Must be one of: ${VALID_TASK_STATUSES.join(', ')}`
    );
  }
  return status as TaskStatus;
}

export function validateStatusTransition(
  fromStatus: TaskStatus,
  toStatus: TaskStatus,
  taskId: number
): void {
  const allowedTransitions = VALID_STATUS_TRANSITIONS[fromStatus];
  if (!allowedTransitions.includes(toStatus)) {
    throw new ValidationError(
      `Cannot transition task ${taskId} from "${fromStatus}" to "${toStatus}": ` +
        `backward status transitions are not allowed. ` +
        `Valid transitions from "${fromStatus}": ${allowedTransitions.join(', ') || 'none (terminal state)'}`
    );
  }
}

export function validateRequired<T>(
  value: T | null | undefined,
  fieldName: string
): T {
  if (value === null || value === undefined || value === '') {
    throw new ValidationError(`Missing required field: ${fieldName}`);
  }
  return value;
}

export function validatePositiveInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ValidationError(`${fieldName} must be a positive integer`);
  }
}
