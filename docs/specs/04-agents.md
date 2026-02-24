# MAPS Specification: Agent Framework (General)

## Status: Draft

## Overview
Agents are Claude Code personas defined as markdown files in `.claude/agents/`. Each persona provides role-specific instructions, mindset, and guidelines that Claude activates when working on a task of that type. The `/maps` command (the Orchestrator) activates the appropriate persona based on the task's `agent` field.

Agents are not separate processes or TypeScript classes — they are Claude operating under a specific set of instructions. The MCP server tools and the task tree drive what happens next.

This document covers the general agent framework architecture. Each agent role has its own specification:

- [04a-agent-researcher.md](04a-agent-researcher.md) — Searches web and analyzes current codebase
- [04b-agent-architect.md](04b-agent-architect.md) — Writes specifications and implementation catalogs
- [04c-agent-developer.md](04c-agent-developer.md) — Writes implementation plans and builds code
- [04d-agent-critic.md](04d-agent-critic.md) — Performs critical reviews, triages test failures
- [04e-agent-test-writer.md](04e-agent-test-writer.md) — Writes and revises unit tests
- [04f-agent-reviser.md](04f-agent-reviser.md) — Updates implementation plans after failures

## Agent Roles and Workflow Mapping

| Workflow Step | Description | Agent |
|---------------|-------------|-------|
| 1 | User describes problem statement | `user` |
| 2 | Analyze current codebase | Researcher |
| 3 | Search web for domain articles | Researcher |
| 4 | Write specification | Architect |
| 5 | Critical Review #1 | Critic |
| 6-7 | Review spec + open questions | `user` |
| 8 | Critical Review #2 | Critic |
| 9-10 | Address questions + sign-off | `user` |
| 11 | Build implementation catalog | Architect |
| 12 | Write implementation plans | Developer (using research and spec via `artifact_list`) |
| 13 | Critical Review #3 | Critic |
| 14 | Resolve remaining questions | `user` |
| 15 | Build each implementation plan | Developer |
| 16 | Write and run unit tests | Test Writer |
| 17a | Triage test failures | Critic (determines: code wrong, test wrong, or both) |
| 17b | Revise implementation plan | Reviser (if code is wrong) |
| 17c | Rebuild code | Developer (from revised plan) |
| 17d | Revise tests | Test Writer (if test is wrong) |
| 18 | Write and run integration tests | Test Writer |
| 19a | Triage integration test failures | Critic |
| 19b | Revise implementation plan | Reviser (if code is wrong) |
| 19c | Rebuild code | Developer (from revised plan) |
| 19d | Revise integration tests | Test Writer (if test is wrong) |

## Requirements
- Each agent persona has a clearly defined role with specific instructions and guidelines
- The `/maps` command (Orchestrator) activates the appropriate persona for each task
- Agent personas are markdown files in `.claude/agents/`, one per role. Each file is self-contained — there is no base template that personas extend
- All task and artifact management goes through the MCP server tools
- Agents own their own task status transitions — they set `in_progress` when starting work and `done` when finished, via the `task_update` MCP tool
- Agents have full access to the project file system via Claude Code's built-in tools (reading files, writing files, running commands). The MCP server is not a file system gateway — it manages tasks, blockers, and artifacts only
- Agents retrieve relevant documents (specs, plans, research) via the `artifact_list` MCP tool and reading the files at the returned paths. Documents are the durable shared state between persona activations
- All loops must have configurable hard limits to prevent runaway processes. When a hard limit is reached, the workflow pauses and surfaces the situation to the user as a human review step

## Resolved Decisions

### Implementation: Claude Code personas with markdown role definitions
Agents are implemented as **markdown persona files** in `.claude/agents/`. Each file defines the agent's role, mindset, instructions, and guidelines. The `/maps` command activates the appropriate persona when working on a task.

This approach was adopted after reviewing the [Agent Fabric](https://github.com/reliable/agent-fabric) project, which successfully uses the same pattern. Benefits:
- **No framework to build** — Claude Code already handles multi-turn tool use, context management, and file system access
- **No separate Anthropic API calls** — Claude Code IS the LLM
- **Editable agent personalities** — markdown files are easy to review and tweak
- **Natural human interaction** — the user converses with Claude directly during human review steps
- **Task tree drives sequencing** — the MCP server's `next_task` tool and dependency system handle workflow ordering

A custom TypeScript framework with separate Anthropic API calls was considered but rejected — Claude Code already provides everything the framework would have built (multi-turn tool use, context management, file access), and the persona approach is dramatically simpler.

### Six separate agent roles
All six roles remain as separate agents. Each has a distinct mindset and purpose:
- The **Developer** builds; the **Test Writer** challenges what was built
- The **Architect** designs; the **Critic** finds gaps in the design
- The **Reviser** fixes plans; distinct from the Developer who executes them

Combining roles (e.g., Critic + Reviser) would dilute the focused prompts that make each agent effective at its specific job.

### Architecture: two distinct layers

The system has two layers with a clear separation of concerns:

| Layer | Components | Powered by |
|-------|-----------|------------|
| **Intelligence** | Researcher, Architect, Developer, Critic, Test Writer, Reviser | Claude Code + markdown persona files |
| **Infrastructure** | MCP Server, SQLite database | Deterministic TypeScript code |

The **`/maps` command** (the Orchestrator) is a markdown file in `.claude/commands/` that defines workflow phases and sequencing rules. Claude Code follows these instructions, calling `next_task` to find work and activating the appropriate agent persona for each task.

**Agent personas** are markdown files in `.claude/agents/`, one per role. Each defines the agent's mindset, instructions, and guidelines. When the `/maps` command identifies a task for a given agent, it activates that persona — Claude operates under those instructions for the duration of that task.

Individual agent personas focus purely on their own work — they use MCP tools, read/write files, and update their own task status. They do not decide what happens next. The `/maps` command instructions and the task tree handle sequencing.

### Session delegation model
Agent tasks are delegated to fresh child sessions via Claude Code's Task tool (`subagent_type="general-purpose"`). Each child session:

- Receives a **curated context package** from the Orchestrator: task details, relevant artifact file paths, and a list of source files to review
- Gets a **fresh context window** — no accumulated conversation history from previous tasks
- Reads its **agent persona file** (`.claude/agents/<agent>.md`) as its first action
- **Owns its task lifecycle** — sets `in_progress`, does work, registers artifacts, sets `done`
- Returns a **structured summary** to the Orchestrator (files created/modified, decisions made, issues)

This replaces the earlier model where all agent personas operated within a single conversation. The change prevents context window degradation over long workflows — each task gets focused context instead of inheriting the full accumulated history.

**Human review tasks** (`agent="user"`) are still handled inline in the Orchestrator's conversation, since they require user interaction.

**The Orchestrator never performs agent work itself** — it only manages task sequencing, constructs delegation prompts, spawns child sessions, and processes results.

### Context sharing
Context is shared between agent sessions exclusively through **documents on disk** and the **task/artifact database**. There is no shared conversation history between sessions. Agents retrieve documents via `artifact_list` and file reading. The Orchestrator curates which files each child session should review, based on summaries from previous sessions. Documents are the durable shared state.

### Test failure triage
When tests fail, the **Critic** reviews the failing tests against the spec, acceptance criteria, and code to determine the cause:
- **Code is wrong** → Reviser updates the implementation plan → Developer rebuilds → re-test
- **Test is wrong** → Test Writer revises the test → re-test
- **Both are wrong** → test revision happens after the code fix

This ensures the right agent fixes the right problem.

## Open Questions (General Framework)
1. ~~How does an agent "spawn" a child agent — subprocess? API call? Function call within the framework?~~ **Resolved** — Agents do not spawn other agents. The `/maps` command (Orchestrator) handles all sequencing. It calls `next_task` to find the next available task, activates the appropriate agent persona, and after the task is complete, determines what comes next via the task tree. See "Architecture: two distinct layers" above.
2. ~~What happens when an agent hits its hard limit without meeting success criteria? How is this surfaced to the user?~~ **Resolved** — The Orchestrator pauses the workflow and surfaces it to the user as a human review step (the same mechanism used for all human interaction points). The persisted state includes what was attempted, iteration count, and the last failure reason. The user can then adjust the approach, raise the limit, or intervene manually.
3. ~~Do agents share any context, or is each agent's context window completely independent?~~ **Resolved** — Each agent task runs in an independent child session with its own context window. Context is shared exclusively through documents on disk (specs, plans, code, test results) and the task/artifact database, retrieved via `artifact_list` and file reading. The Orchestrator curates which documents and source files each child session receives. There is no shared conversation history between agent sessions — documents are the durable shared state.
4. ~~How are agent prompts structured? Is there a base prompt template that all agents extend?~~ **Resolved** — Each agent persona markdown file contains the full instructions for that role. The `/maps` command activates a persona by referencing it when working on a task. The persona file defines the agent's mindset, guidelines, and instructions. Task context (description, acceptance criteria) comes from the MCP server via `task_get`. Relevant documents (specs, plans, code) are retrieved via `artifact_list` and file reading tools. There is no base prompt template — each persona file is self-contained, and Claude Code handles context management natively.
5. ~~How do agents report progress/status back to the system?~~ **Resolved** — Agents update their own task status via MCP tools (`task_update` to set `in_progress`, then `done`). MCP tool calls produce observable state changes in the database (creating documents, updating tasks, registering artifacts). The task tree is the primary progress-tracking mechanism — the `/maps` command can check task statuses to understand where things stand.
6. ~~Should agents have access to the full project file system, or only to specific files relevant to their task?~~ **Resolved** — Agents have full access to the project file system via the LLM's built-in tools (reading files, writing files, running commands). This autonomy is essential — agents need to inspect existing code, create new files, run tests, etc. The MCP server is not a file system gateway; it manages tasks, blockers, and artifacts. The `artifact_list` MCP tool is a convenience for discovering epic-scoped documentation files, not a bottleneck for all file access.

## Dependencies
- [03-mcp-server.md](03-mcp-server.md) — Agents interact with the DB through the MCP server tools.
- [05-orchestrator.md](05-orchestrator.md) — The `/maps` command activates agent personas and manages workflow sequencing.
- [06-compressor.md](06-compressor.md) — Agents use the `compress` MCP tool to densify documents before using them as working context.
- [07-workflow.md](07-workflow.md) — The workflow defines when and how each agent persona is activated.
