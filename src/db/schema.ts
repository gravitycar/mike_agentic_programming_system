/**
 * Database schema for MAPS
 * SQLite database stored at .maps/maps.db within target projects
 */

export interface Task {
  id: number;
  parent_id: number | null;
  type: TaskType;
  name: string;
  description: string;
  status: TaskStatus;
  agent: string;
  results: string | null;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
  completed_at: string | null; // ISO 8601
}

export type TaskType =
  | 'epic'
  | 'research'
  | 'specification'
  | 'agent-review'
  | 'human-review'
  | 'catalog'
  | 'plan'
  | 'implement'
  | 'test'
  | 'question';

export type TaskStatus =
  | 'open'
  | 'in_progress'
  | 'blocked'
  | 'done'
  | 'deferred'
  | 'orphaned';

export interface Blocker {
  id: number;
  blocked_task_id: number;
  blocked_by_task_id: number;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
}

export interface Artifact {
  id: number;
  task_id: number;
  artifact_type: string;
  file_path: string;
  created_at: string; // ISO 8601
}

export interface Config {
  key: string;
  value: string;
  updated_at: string; // ISO 8601
}

export const CREATE_TASKS_TABLE = `
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL,
  agent TEXT NOT NULL,
  results TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (parent_id) REFERENCES tasks(id)
)`;

export const CREATE_BLOCKERS_TABLE = `
CREATE TABLE IF NOT EXISTS blockers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  blocked_task_id INTEGER NOT NULL,
  blocked_by_task_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (blocked_task_id) REFERENCES tasks(id),
  FOREIGN KEY (blocked_by_task_id) REFERENCES tasks(id),
  UNIQUE(blocked_task_id, blocked_by_task_id)
)`;

export const CREATE_ARTIFACTS_TABLE = `
CREATE TABLE IF NOT EXISTS artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  artifact_type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
)`;

export const CREATE_CONFIG_TABLE = `
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;

export const ALL_TABLES = [
  CREATE_TASKS_TABLE,
  CREATE_BLOCKERS_TABLE,
  CREATE_ARTIFACTS_TABLE,
  CREATE_CONFIG_TABLE,
];
