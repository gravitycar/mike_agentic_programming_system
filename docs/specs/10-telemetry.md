# MAPS Specification: Sub-Agent Telemetry

## Status: Draft

## Overview
`/maps` delegates work to agent personas as fresh child sessions, one at a time, via Claude Code's `Agent` tool. MAPS has no record of what any of this costs in tokens or time. This spec adds that record: automatic, per-sub-agent-task token and elapsed-time capture, stored in a database shared across every project MAPS runs in, and read back through an MCP tool. The goal is to let a change meant to reduce token burn be measured against real runs, not guessed at, and to compare cost across agent personas, projects, and recorded MAPS versions.

## Context
Claude Code fires a `SubagentStop` hook whenever a delegated sub-agent session ends. Its JSON payload (delivered on stdin) includes `agent_type` (the persona name) and `agent_transcript_path` (the absolute path to that sub-agent's own JSONL transcript on disk), among other fields. It carries no token or duration numbers directly — those live in the transcript itself, one JSON line per turn, each assistant turn holding a `usage` object (input/output/cache token counts) and an ISO timestamp. Summing `usage` across turns (deduped by message id, since a streamed turn can repeat one) gives the true total for that sub-agent's run; the span between the first and last timestamp gives the true elapsed time.

This transcript JSON shape is undocumented and unversioned by Claude Code, and could shift between releases. All of the code that reads it is isolated in one file (`src/hooks/parse-transcript.ts`) for exactly that reason.

## Why a separate, shared database
Each project already has its own isolated `.maps/maps.db`. That isolation is wrong for telemetry: comparing cost across projects, or confirming a MAPS change reduced token burn across every project it's used in, requires one store that spans all of them. Telemetry therefore lives at `~/.maps/telemetry.db` — a second SQLite database, outside any single project, in the user's home directory rather than tied to the MAPS install path (so it survives a MAPS reinstall at a different location).

## Schema
One table, `agent_run` (full definition in `src/db/telemetry-schema.ts`):

| Column | Description |
|---|---|
| id | Primary key |
| project_path | Absolute path of the project the sub-agent ran in — the cross-project join key |
| project_name | `basename(project_path)`, stored for display/grouping |
| epic_name | The epic the delegated task belonged to, or `NULL` if unresolved |
| task_id | The project's own `tasks.id` for the delegated task, or `NULL` if unresolved. Not a foreign key — it points into a different physical database. |
| agent_type | Persona name, taken directly from the hook payload |
| model | Best-effort; transcript usage blocks don't reliably carry a model string, so this may be `NULL` |
| input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens | Summed across the transcript, deduped by message id |
| elapsed_ms | Last transcript timestamp minus first |
| maps_version | Git short hash of the MAPS install, captured at write time — what makes before/after comparisons for a specific MAPS change possible |
| started_at | ISO 8601, first transcript timestamp |
| created_at | ISO 8601, row insert time |

Indexed on `project_path`, `maps_version`, and `agent_type` — the dimensions `telemetry_report` filters and groups by.

## The hook
`bin/maps-subagent-telemetry.sh` launches `dist/hooks/subagent-telemetry.js` the same way `bin/maps-server.sh` launches the MCP server — `cd` into the MAPS install directory first, so the node version pinned by MAPS's own `.tool-versions` resolves, matching the node `better-sqlite3`'s native binding was built against. `maps-init.sh` registers it in the target project's `.claude/settings.json` under `hooks.SubagentStop`, referenced by its MAPS-install-absolute path — nothing is copied into the target project, the same pattern `.mcp.json`'s `maps` entry already uses for `maps-server.sh`.

On each firing, the hook:
1. Reads the JSON payload from stdin; pulls `agent_type` and `agent_transcript_path`.
2. Reads `CLAUDE_PROJECT_DIR` from the environment (exported by Claude Code to hook processes) to identify the project.
3. Parses the transcript (`parseTranscript`) for summed token usage and elapsed time.
4. Resolves `task_id`/`epic_name`: reads `.maps/.active_task`, a plain-text marker file the `/maps` orchestrator writes with the task id immediately before each delegation (Step 3 of `.claude/commands/maps.md`). This is safe because `/maps` never has more than one delegation in flight — there's nothing for the marker to race against. If present, the hook opens the project's own `.maps/maps.db` **read-only** and walks `parent_id` up to the root epic task for its name.
5. Computes `maps_version` via `git rev-parse --short HEAD` against the MAPS install directory (not the target project).
6. Inserts one row into `~/.maps/telemetry.db`.

Every step after reading stdin is wrapped in one try/catch that always ends in `process.exit(0)`. A missing marker file, an unreadable transcript, a `git` that isn't available — none of these may block or fail the sub-agent lifecycle event. Worst case, no row is written and the failure is logged to stderr; a hook that could hang or error out a session is worse than missing one data point.

### Accepted exception to "the MCP server is the only DB gateway"
The hook writes to `~/.maps/telemetry.db` directly with `better-sqlite3`, not through the MCP server. This is a deliberate, narrow exception: the gateway rule exists to protect the task state machine (status transitions, blocker integrity, epic scoping), and a pure telemetry write touches none of that. Reads stay MCP-tool-only, through `telemetry_report` — see [03-mcp-server.md](03-mcp-server.md).

## The `telemetry_report` tool
Reads `~/.maps/telemetry.db`, aggregates with a `GROUP BY` over a caller-chosen dimension, and returns a pre-formatted markdown table (the first MAPS tool to return text instead of JSON, following the precedent `compress` already set for non-JSON responses).

Parameters (all optional):
- `scope`: `current_project` (default) or `all_projects`
- `group_by`: `agent_type` (default), `project`, `maps_version`, or `date`
- `maps_version`, `since`, `until`: filters

`scope: "current_project"` requires an initialized project (the tool is told the current project path server-side, the same way `compress` is); calling it with no project initialized and no `all_projects` scope is a validation error. An empty result returns a one-line "no telemetry recorded" message rather than an error, matching `artifact_list`'s empty-list convention.

## Open Questions
1. **Retention/pruning.** `~/.maps/telemetry.db` has no pruning policy yet and will grow unbounded across every project and every run. Not a problem at current scale; worth a daily-prune mechanism (comparable to Andy's `claude-plugin` telemetry setup) if the table grows large enough to slow `telemetry_report` down.
2. **`model` nullability.** Currently best-effort and frequently `NULL`, since transcript usage blocks don't reliably carry a model string. Revisit if a future Claude Code transcript version makes it reliable — per-model cost breakdowns would be a natural addition to `telemetry_report`.
3. **Marker-file replacement.** If a future `SubagentStop` payload ever carries task context directly, `.maps/.active_task` and the read-only cross-database lookup it triggers could be removed in favor of reading `task_id` straight off the payload.

## Dependencies
- [01-db-schema.md](01-db-schema.md) — the per-project database `~/.maps/telemetry.db` is deliberately separate from.
- [03-mcp-server.md](03-mcp-server.md) — `telemetry_report`'s tool shape and the gateway-rule exception.
- [05-orchestrator.md](05-orchestrator.md) — the `/maps` Step 3 change that writes `.maps/.active_task`.
