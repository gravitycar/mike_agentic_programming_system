/**
 * Schema for the shared, cross-project telemetry database
 * SQLite database stored at ~/.maps/telemetry.db — NOT per-project, NOT part of
 * schema.ts's ALL_TABLES. See docs/specs/10-telemetry.md.
 */

export interface AgentRun {
  id: number;
  project_path: string; // absolute path, the cross-project join key
  project_name: string; // basename(project_path), stored for display/grouping
  epic_name: string | null;
  task_id: number | null; // correlates to the project's own tasks.id; not an FK (cross-db)
  agent_type: string; // persona name, from the SubagentStop payload
  model: string | null; // best-effort; transcript usage blocks don't reliably carry it
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  elapsed_ms: number;
  maps_version: string; // git short hash of the MAPS install at write time
  started_at: string; // ISO 8601, first transcript timestamp
  created_at: string; // ISO 8601, row insert time
}

export const CREATE_AGENT_RUN_TABLE = `
CREATE TABLE IF NOT EXISTS agent_run (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_path TEXT NOT NULL,
  project_name TEXT NOT NULL,
  epic_name TEXT,
  task_id INTEGER,
  agent_type TEXT NOT NULL,
  model TEXT,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cache_creation_tokens INTEGER NOT NULL,
  cache_read_tokens INTEGER NOT NULL,
  elapsed_ms INTEGER NOT NULL,
  maps_version TEXT NOT NULL,
  started_at TEXT NOT NULL,
  created_at TEXT NOT NULL
)`;

export const CREATE_AGENT_RUN_PROJECT_IDX = `CREATE INDEX IF NOT EXISTS idx_agent_run_project ON agent_run(project_path)`;
export const CREATE_AGENT_RUN_VERSION_IDX = `CREATE INDEX IF NOT EXISTS idx_agent_run_version ON agent_run(maps_version)`;
export const CREATE_AGENT_RUN_AGENT_TYPE_IDX = `CREATE INDEX IF NOT EXISTS idx_agent_run_agent_type ON agent_run(agent_type)`;

export const ALL_TELEMETRY_TABLES = [
  CREATE_AGENT_RUN_TABLE,
  CREATE_AGENT_RUN_PROJECT_IDX,
  CREATE_AGENT_RUN_VERSION_IDX,
  CREATE_AGENT_RUN_AGENT_TYPE_IDX,
];
