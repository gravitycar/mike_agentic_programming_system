# MAPS Specification: MCP Server

## Status: Draft

## Overview
The MCP Server is the bridge between LLM-powered agents and the MAPS database. It runs locally, communicates over stdio, and exposes tools that agents use to create, query, and update tasks and documents.

## Context
From the initial design notes: The MCP Server runs from the MAPS project directory, communicates over stdio, and is configured per-project via `mcp.json`. It manages SQLite lifecycle and accepts a project working directory to isolate databases per project.

## Requirements

### Implementation
- TypeScript on Node.js
- Official Anthropic MCP SDK (`@modelcontextprotocol/sdk`)
- `better-sqlite3` for database access

### Transport
- Communicate over stdio
- Run locally from the MAPS project directory

### Database Lifecycle
- Accept a project working directory path from the calling agent
- Use that path to determine the SQLite database file location
- Initialize the database and schema if it doesn't already exist

### Epic Scoping
All task and artifact operations are automatically scoped to the current epic, as determined by the `current_epic_id` value in the `config` table. Agents never pass an epic ID explicitly — the MCP server reads it from config and constrains all queries and mutations to that epic's task tree. This prevents agents from accidentally operating on the wrong epic's data.

Switching work contexts is done by updating `current_epic_id` via `set_config`.

### Tools

The MCP server exposes the following tools:

#### Design Principle: Consolidate Similar Operations
Tools that perform the same verb on the same resource (e.g., "list tasks with different filters") are consolidated into a single tool with optional parameters. This reduces the number of tools the LLM must choose between and eliminates ambiguity. Tools with semantically distinct purposes (e.g., "list tasks" vs "find the next thing to work on") remain separate, because the intent is different even if the underlying data is similar.

#### Task Management (scoped to current epic)
- `task_create` — create a new task (must be parented under the current epic's tree)
- `task_get` — retrieve a single task by ID (validated against current epic)
- `task_update` — update status, results, etc. Includes cascading unblock logic: when a task is marked `done`, check if any tasks it blocks are now fully unblocked and update them to `open`
- `task_list` — query tasks with optional filters (status, type, parent, agent). No filters returns all tasks in the current epic's tree

#### Epic Management (not scoped — operates across epics)
- `epic_list` — list epics, optionally filtered to active (non-`done`) only

#### Blocker Management (scoped to current epic)
- `blocker_add` — create a blocking relationship between two tasks. Automatically sets the blocked task's status to `blocked` regardless of its current status (including `done` — see Status Lifecycle exception below).
- `blocker_remove` — remove a blocking relationship. If removing this blocker leaves the task with no remaining unresolved blockers, updates the task from `blocked` to `open`.
- `blocker_dependencies` — given a task, return all tasks that block it ("what's blocking me?")
- `blocker_dependents` — given a task, return all tasks it blocks ("what am I blocking?")

#### Artifact Management (scoped to current epic)
- `artifact_register` — record a new artifact (task_id, artifact_type, file_path)
- `artifact_list` — query artifacts with optional filters (task, artifact_type)

#### Config Management
- `config_set` — set a key-value pair (e.g., `current_epic_id`)
- `config_get` — retrieve a config value by key

#### Compression (see [06-compressor.md](06-compressor.md))
- `compress` — accept markdown text and return a semantically densified version with reduced token count. Used by Claude when retrieving documents as working context.

#### Convenience
- `next_task` — find the next unblocked task, optionally filtered by agent role
- `project_init` — create the `.maps/` directory structure and database

### Validation

The MCP server is the single gateway to the database and enforces all business rules. The database itself only enforces foreign keys.

#### Input Validation
- Required fields are present (e.g., task must have name, type, status, agent)
- Enum values are valid (status, type, and agent must be from defined lists)
- Foreign keys point to real records (parent_id, task_id on artifacts/blockers)

#### Epic Scoping
- All task and artifact mutations/queries are constrained to the current epic's tree
- `current_epic_id` must be set before any scoped operation can execute
- New tasks must be parented under the current epic's tree

#### Status Lifecycle
Status transitions only move forward. If work needs to be redone, create a new task — do not reopen a completed task. This preserves the audit trail, avoids blocker cascade complications, and is consistent with the insert-new-row versioning strategy used for artifacts.

Valid transitions:
```
open → in_progress → done
open → blocked → open → in_progress → done
any → deferred
in_progress → orphaned
```

The `orphaned` status is a terminal state used during crash recovery when an agent was mid-execution and the process died. The Orchestrator sets this status and creates a new replacement task. See [05-orchestrator.md](05-orchestrator.md).

Invalid transitions: any backward movement via `task_update` (e.g., `done` → `open`, `in_progress` → `open`).

**Exception**: `blocker_add` can set any task's status to `blocked`, including tasks that are `done`. This is not a manual reopening — it's the system enforcing that a task cannot be considered complete if it has unresolved blockers. This handles the case where a dependency is discovered after a task was prematurely completed.

When `task_update` sets a task to `done`, the MCP server checks all tasks it blocks. For each blocked task, if all of its blockers are now `done`, update that task from `blocked` to `open`.

#### Blocker Integrity
- Cannot create circular blockers (A blocks B, B blocks A — or longer cycles)
- Both tasks in a blocker relationship must exist and belong to the current epic

#### Artifact Integrity
- Artifact's task_id must exist and belong to the current epic

#### Workflow Rules
- Cannot mark a parent task `done` if it has non-`done` children
- `project_init` is idempotent — safe to run on an already-initialized project

#### Not Validated by the MCP Server (agent responsibilities)
- Document size (10K token limit) — authoring concern enforced by agents and their guidelines
- File path is within the `.maps/` directory structure — agents follow the directory conventions when writing files
- File at a registered artifact path exists on disk — agents are responsible for writing the file before registering the artifact

### Tool Signatures

#### Task Object (returned by task tools)
```
{
  id: number,
  parent_id: number | null,
  type: string,
  name: string,
  description: string,
  status: string,
  agent: string,
  results: string | null,
  created_at: string (ISO 8601),
  updated_at: string (ISO 8601),
  completed_at: string | null (ISO 8601)
}
```

#### Blocker Object (returned by blocker tools)
```
{
  id: number,
  blocked_task_id: number,
  blocked_by_task_id: number,
  created_at: string (ISO 8601),
  updated_at: string (ISO 8601)
}
```

#### Artifact Object (returned by artifact tools)
```
{
  id: number,
  task_id: number,
  artifact_type: string,
  file_path: string,
  created_at: string (ISO 8601)
}
```

#### `task_create`
- **Params**: `parent_id` (required number), `type` (required string), `name` (required string), `description` (required string), `agent` (required string)
- **Returns**: Task object
- **Behavior**: Status is set automatically by the server — `open` if no blockers exist for this task, `blocked` otherwise. `created_at` and `updated_at` set by the server.

#### `task_get`
- **Params**: `task_id` (required number)
- **Returns**: Task object
- **Errors**: `not_found` if task doesn't exist or isn't in the current epic

#### `task_update`
- **Params**: `task_id` (required number), `status` (optional string), `name` (optional string), `description` (optional string), `agent` (optional string), `results` (optional string)
- **Returns**: Task object (updated)
- **Behavior**: At least one optional param must be provided. Setting status to `done` triggers cascading unblock and sets `completed_at`. Server updates `updated_at` automatically.

#### `task_list`
- **Params**: `status` (optional string), `type` (optional string), `parent_id` (optional number), `agent` (optional string)
- **Returns**: Array of Task objects
- **Behavior**: No filters returns all tasks in the current epic's tree. Multiple filters are AND-ed.

#### `epic_list`
- **Params**: `active_only` (optional boolean, default `false`)
- **Returns**: Array of Task objects where type = `epic`

#### `blocker_add`
- **Params**: `blocked_task_id` (required number), `blocked_by_task_id` (required number)
- **Returns**: Blocker object
- **Behavior**: Validates no circular dependencies. Automatically sets the blocked task's status to `blocked`.

#### `blocker_remove`
- **Params**: `blocked_task_id` (required number), `blocked_by_task_id` (required number)
- **Returns**: `{ success: true }`
- **Behavior**: If removing this blocker leaves the task with no remaining unresolved blockers, updates the task from `blocked` to `open`.

#### `blocker_dependencies`
- **Params**: `task_id` (required number)
- **Returns**: Array of Blocker objects (with related Task objects for each blocking task)
- **Behavior**: Returns all tasks that block the given task ("what's blocking me?")

#### `blocker_dependents`
- **Params**: `task_id` (required number)
- **Returns**: Array of Blocker objects (with related Task objects for each blocked task)
- **Behavior**: Returns all tasks that the given task blocks ("what am I blocking?")

#### `artifact_register`
- **Params**: `task_id` (required number), `artifact_type` (required string), `file_path` (required string)
- **Returns**: Artifact object

#### `artifact_list`
- **Params**: `task_id` (optional number), `artifact_type` (optional string)
- **Returns**: Array of Artifact objects, ordered by `created_at` descending (latest version first)

#### `config_set`
- **Params**: `key` (required string), `value` (required string)
- **Returns**: `{ key: string, value: string, updated_at: string }`

#### `config_get`
- **Params**: `key` (required string)
- **Returns**: `{ key: string, value: string, updated_at: string }`
- **Errors**: `not_found` if the key doesn't exist

#### `next_task`
- **Params**: `agent` (optional string — filter by agent role)
- **Returns**: Task object or `null` if no open tasks are available

#### `project_init`
- **Params**: `project_path` (required string)
- **Returns**: `{ success: true, paths_created: string[] }`
- **Behavior**: Idempotent — safe to call on an already-initialized project. Creates `.maps/`, `.maps/maps.db`, `.maps/docs/`.

### Error Handling

MCP tool calls return either a result or an error. Errors include a category code and a human-readable message that helps the LLM agent understand what went wrong and how to recover.

#### Error Categories

| Category | Description | Agent Remediation |
|----------|-------------|-------------------|
| `validation_error` | Malformed input — missing required fields, invalid enum values, wrong data types | Fix the input and retry |
| `not_found` | Referenced entity doesn't exist — bad task ID, missing config key, no matching artifacts | Query for the correct ID or check that the entity exists |
| `rule_violation` | Input is valid and entities exist, but the operation violates a business rule — invalid status transition, circular blocker, epic scoping violation, parent has open children | Change approach; the operation is not allowed |
| `precondition_error` | System is not in the required state — `current_epic_id` not set, project not initialized | Perform the required setup step first (set epic, run `project_init`) |
| `infrastructure_error` | Outside application control — database corrupted/locked, disk full, filesystem permission denied | Surface to the user; agent cannot self-remediate |

All errors should include enough context in the message for the agent to understand the problem without needing a follow-up query (e.g., "Cannot transition task 42 from `done` to `open`: backward status transitions are not allowed" rather than "Invalid status").

## Open Questions
1. ~~What is the full list of MCP tools we need to expose?~~ **Resolved** — 15 tools across 6 categories. See Tools section above.
2. ~~What are the exact signatures (parameters, return types) for each tool?~~ **Resolved** — Full signatures defined in Tool Signatures section, including params, return types, behavior notes, and error cases for all 15 tools.
3. ~~Should the MCP server handle any validation logic, or is it a thin pass-through to the DB?~~ **Resolved** — The MCP server handles all business rule validation (input validation, epic scoping, status lifecycle, blocker integrity, artifact integrity, workflow rules). The database enforces only foreign keys. See Validation section above.
4. ~~How does the MCP server report errors back to agents?~~ **Resolved** — Five error categories: `validation_error`, `not_found`, `rule_violation`, `precondition_error`, `infrastructure_error`. Each error includes a category code and a descriptive message with enough context for the agent to understand the problem and determine how to recover. See Error Handling section above.
5. ~~Should tools be granular (one tool per operation) or coarse (fewer tools, more parameters)?~~ **Resolved** — Consolidate tools that perform the same verb on the same resource into one tool with optional parameters. Keep tools with semantically distinct purposes separate. Consistent category prefixes (`task_`, `blocker_`, `artifact_`, `config_`, `epic_`) help the LLM pattern-match by category.
6. ~~Do we need any tools beyond CRUD — e.g., a tool that returns "the next unblocked task"?~~ **Resolved** — Yes. `next_task` (find next unblocked task) and `project_init` (initialize `.maps/` and database) are convenience tools beyond basic CRUD.
7. ~~What language/framework will the MCP server be implemented in?~~ **Resolved** — TypeScript on Node.js, using the official Anthropic MCP SDK (`@modelcontextprotocol/sdk`) and `better-sqlite3` for database access.

## Dependencies
- [01-db-schema.md](01-db-schema.md) — The MCP server wraps the database; the schema must be defined first or in tandem.
- [02-document-management.md](02-document-management.md) — Artifact tools depend on the document management strategy (epic-scoped directories, insert-new-row versioning).
- [06-compressor.md](06-compressor.md) — The `compress` tool implements the Compressor's semantic densification logic.
