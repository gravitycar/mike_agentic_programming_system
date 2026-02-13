# MAPS Specification: Database Schema

## Status: Draft

## Overview
The database is a per-project SQLite database stored at `.maps/maps.db` within the target project directory. It stores the task hierarchy, blockers, artifact references, and project configuration. Each project gets its own isolated database file. Document files themselves live on the filesystem (see [02-document-management.md](02-document-management.md)); the database tracks their locations via the artifacts table.

The database only enforces foreign keys. All business rule validation (status transitions, epic scoping, blocker integrity) is handled at the application level by the MCP server, which is the single gateway to the database. See [03-mcp-server.md](03-mcp-server.md).

## Context
Four tables are defined:

### Tasks (from napkin notes)
| Column       | Description |
|--------------|-------------|
| id           | Primary key |
| parent_id    | Foreign key to parent task |
| type         | epic, research, specification, agent-review, human-review, catalog, plan, implement, test, question |
| name         | Short name |
| description  | Detailed description |
| status       | open, in_progress, blocked, done, deferred, orphaned |
| agent        | Who handles this task: an agent role (architect, researcher, developer, critic, test_writer, reviser) or `user` for tasks requiring human action |
| results      | Agent operational output (confirmations, summaries, notes). Documents are tracked separately via the artifacts table, not stored here. |
| created_at   | Timestamp |
| updated_at   | Timestamp |
| completed_at | Timestamp |

### Blockers (from napkin notes)
| Column            | Description |
|-------------------|-------------|
| id                | Primary key |
| blocked_task_id   | Task that is blocked |
| blocked_by_task_id| Task that is doing the blocking |
| created_at        | Timestamp |
| updated_at        | Timestamp |

Blocker resolution is inferred from the blocking task's status — a blocker is resolved when the `blocked_by_task_id` task has status `done`. No explicit `status` or `resolved_at` column is needed on this table.

### Artifacts
| Column        | Description |
|---------------|-------------|
| id            | Primary key |
| task_id       | FK to the task that produced this artifact |
| artifact_type | Category of the artifact (spec, catalog, implementation_plan, research_summary, codebase_summary, test_results, etc.) |
| file_path     | Path to the file on disk |
| created_at    | Timestamp |

When a document is revised, a new row is inserted rather than updating the existing row. This provides version history — the latest version is the most recent row for a given artifact type. See [02-document-management.md](02-document-management.md) for details.

### Config
| Column     | Description |
|------------|-------------|
| key        | Setting name (e.g., `current_epic_id`) |
| value      | Setting value |
| updated_at | Timestamp |

A simple key-value store for project-level settings. The primary use case is tracking which epic is currently active via `current_epic_id`, since multiple epics may be in progress simultaneously and there is no way to reliably infer the current one from task status alone.

### Task Hierarchy
Tasks form a tree rooted at an Epic. The `parent_id` column provides organizational grouping (e.g., "this open question belongs to this critical review"). The `blockers` table provides execution dependencies (e.g., "can't start X until Y is done"). These are separate concerns:

- **Sequential tasks** are expressed as a chain of blockers (Research blocks Compose Spec, which blocks Human Review).
- **Parallel tasks** have no blockers between them but may all block a shared downstream task (e.g., all Open Question tasks block Create Implementation Catalog).
- **Dynamic expansion** is handled naturally — when a Critical Review produces N open questions, N tasks are created and each is added as a blocker of the next phase.

No explicit `order` or `sequence` column is needed. The "what can I work on next?" query is: find tasks with `open` status.

### Status Lifecycle
Task statuses only move forward via `task_update`. If work needs to be redone, create a new task rather than reopening a completed one. This preserves the audit trail and is consistent with the insert-new-row versioning strategy for artifacts. Valid transitions: `open → in_progress → done`, `open → blocked → open → in_progress → done`, `any → deferred`, and `in_progress → orphaned`. The `orphaned` status is a terminal state used during crash recovery — see [05-orchestrator.md](05-orchestrator.md) for details. **Exception**: `blocker_add` can set any task to `blocked` (including `done` tasks) when a new dependency is discovered. See [03-mcp-server.md](03-mcp-server.md) for enforcement details.

## Open Questions
1. ~~Is the `results` column adequate for storing task outputs, or do we need a separate documents table?~~ **Resolved** — `results` holds agent operational output (confirmations, summaries). Document files are tracked via the `artifacts` table.
2. ~~Do we need an explicit `order` or `sequence` column to capture sibling ordering within a parent?~~ **Resolved** — No. The blockers table handles all ordering needs. `parent_id` is for grouping; blockers are for execution order.
3. ~~Should `status` transitions be enforced at the DB level (e.g., triggers/constraints) or at the application level?~~ **Resolved** — Application level, in the MCP server. The MCP server is the single gateway to the DB, so it validates status transitions and handles cascading effects (e.g., when a task is marked `done`, check if any tasks it blocks are now fully unblocked and update them to `open`). The DB enforces only basic foreign keys. See [03-mcp-server.md](03-mcp-server.md) for implementation details.
4. ~~Do we need an audit/history table to track status changes over time?~~ **Resolved** — No. Not needed for initial implementation. Can be added later if a pressing need emerges.
5. ~~Is there a need for a `metadata` or `context` column on tasks to store agent-specific configuration?~~ **Resolved** — No generic metadata column needed. An `agent` column was added to specify which agent role handles the task. Other context (search terms, review criteria, etc.) fits naturally in `description`. A JSON metadata column can be added later if an edge case surfaces.
6. ~~Should blocker records have a `status` or `resolved_at` field, or do we infer resolution from the blocking task's status?~~ **Resolved** — Infer from the blocking task's status. A blocker is resolved when the `blocked_by_task_id` task has status `done`. No extra columns needed on the blockers table.
7. ~~The `type` enum — is this list complete? Are there types we're missing?~~ **Resolved** — Updated to: `epic, research, specification, agent-review, human-review, catalog, plan, implement, test, question`. Key changes: `review` split into `agent-review` and `human-review` to emphasize the distinct human review step; `plan` added to distinguish writing implementation plans from executing them.
8. ~~Where does the SQLite file live within the project directory? Root? A `.maps/` subdirectory?~~ **Resolved** — `.maps/` subdirectory (e.g., `/Users/me/projects/awesome_project/.maps/maps.db`). This keeps MAPS files tucked away and provides a home for other MAPS artifacts and configuration.
9. ~~Do we need a `project` or `config` table for storing project-level settings (e.g., the project path, creation date)?~~ **Resolved** — Yes. A `config` key-value table was added to track project-level settings, primarily `current_epic_id`. This is needed because multiple epics can be in progress simultaneously, and agents need to know which epic they're working on to locate the correct documents in the `.maps/docs/<epic-slug>/` directory structure.

## Dependencies
- None — this is a foundational spec that others depend on.
