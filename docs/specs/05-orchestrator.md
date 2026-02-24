# MAPS Specification: Orchestrator

## Status: Draft

## Overview
The Orchestrator is a Claude Code custom command (`/maps`) that drives the MAPS workflow. It is a markdown file that defines workflow phases, agent persona activation, and sequencing rules. Claude Code follows these instructions, using the MCP server tools to manage tasks and the task tree (with dependencies) to determine what happens next.

The Orchestrator is not a separate process or TypeScript component — it is Claude Code itself, guided by the `/maps` command definition.

## Context
The Orchestrator sits between the workflow definition ([07-workflow.md](07-workflow.md)) and the agent personas ([04-agents.md](04-agents.md)):
- The **workflow** defines what the steps are and their sequence
- The **Orchestrator** (the `/maps` command + Claude Code) executes those steps at runtime
- The **agent personas** (markdown files) define the mindset and instructions Claude activates for each step

## Resolved Decisions

### Architecture: Claude Code as Orchestrator
The Orchestrator is implemented as a Claude Code custom command (a markdown file in `.claude/commands/`), not as a separate deterministic TypeScript process. Claude Code itself serves as both the orchestration layer and the execution layer.

This approach was adopted after reviewing the [Agent Fabric](https://github.com/reliable/agent-fabric) project, which successfully uses this pattern. Benefits:
- **No separate framework to build** — Claude Code already handles multi-turn tool use, context management, and file system access
- **No separate Anthropic API calls** — Claude Code IS the LLM
- **Natural human interaction** — the user converses with Claude directly; no separate CLI process or routing mechanism needed
- **Task tree drives sequencing** — the MCP server's `next_task` tool and dependency system handle all workflow ordering

The `/maps` command markdown defines workflow phases, references agent persona files for each phase, and includes instructions for looping, branching, and human review. Claude follows these declaratively.

## Requirements
- Implemented as a Claude Code custom command (markdown file in `.claude/commands/`)
- Uses the MCP server tools for all task and artifact management
- Follows the workflow phases defined in [07-workflow.md](07-workflow.md)
- Activates the appropriate agent persona for each workflow step
- Pauses for human review by presenting questions in the conversation
- Tracks loop iterations via the task tree and respects hard limits
- On restart (new `/maps` invocation), picks up where things left off via `next_task`

## Responsibilities

### Workflow Sequencing
- Call `next_task` to find the next available task
- Activate the appropriate agent persona based on the task's `agent` field
- Perform the work for that step (research, write spec, review, build code, etc.)
- Update task status (`open` → `in_progress` → `done`) via MCP tools
- Create follow-up tasks as needed based on results
- Handle branching logic (e.g., after Critic triage, route to Reviser or Test Writer)

### Crash Recovery
On startup, the Orchestrator checks for any `in_progress` tasks — these are orphaned from a previous crash. For each orphaned task:
1. Set the orphaned task's status to `orphaned` (a terminal state)
2. Create a new replacement task with additional context explaining that a previous attempt appears to have failed
3. The agent receiving the replacement task should carefully examine the file system to determine what, if anything, was already done

Loop iteration counts are derived from the task tree (count completed sibling tasks of the same type under the parent), so they survive crashes without separate state tracking.

### Looping
- Track loop iterations via the task tree (count completed sibling tasks of the same type)
- Respect hard limits defined in the command instructions:
  - **Critical review loop** (Critic finds questions → user answers → Critic re-reviews): **3 iterations**. If the Critic is still finding new questions after 3 rounds, something deeper is wrong and needs human intervention.
  - **Test/fix loop** (test → triage → fix → retest): **5 iterations**. Code fixes can take a few attempts.
  - **Spec review loop** (user feedback → revise → re-review): **no hard limit** — this is human-driven and ends when the user signs off.
- When the hard limit is reached, pause and present the situation to the user

### Human Review
- When `next_task` returns a `human-review` task, present context and questions to the user in the conversation
- The user responds naturally — no `/maps` prefix needed
- Record the user's input and continue the workflow
- If the user kills the session during a human review step, the task remains `open` in the database. On restart, `next_task` picks it up and re-prompts.

### Test Failure Loop
- After Test Writer runs tests, check results
- If failures exist, activate Critic persona for triage
- Read Critic's determination and route accordingly:
  - Code wrong → Reviser → Developer rebuild → re-test
  - Test wrong → Test Writer revision → re-test
  - Both wrong → code fix first, then test revision → re-test
- Loop until tests pass or hard limit is reached

### Code Undo Before Rebuild
- When a test failure requires a code rebuild, undo previous code changes before rebuilding from a revised plan
- Modified files are reverted via `git checkout`; new files are deleted from the file system
- Claude performs these operations directly using its built-in git and file system access — no separate utility needed

## Success Criteria
Success criteria are per-task-type, defined in the `/maps` command instructions:
- **Critical review loop**: succeeds when the Critic finds zero new open questions
- **Test/fix loop**: succeeds when all tests pass
- **Spec review loop**: succeeds when the user signs off (git commit at sign-off before implementation begins)

Success criteria are inherent to the workflow step, not the agent role — the same agent may be invoked in different contexts with different criteria.

## Session Model
The Orchestrator is Claude Code following the `/maps` command instructions within a conversation session. It runs for as long as the session is active. If the session ends, the user starts a new session and re-invokes `/maps` to continue — `next_task` picks up where things left off.

### Session Delegation

Agent tasks are **delegated to fresh child sessions** via Claude Code's Task tool (`subagent_type="general-purpose"`). This prevents context window degradation over long workflows.

**Execution model:**
- The Orchestrator calls `next_task()` to find work
- For agent tasks: constructs a delegation prompt and spawns a child session via Task tool
- For human review tasks: handles inline in its own conversation
- One child at a time — sequential execution, never parallel
- After each child completes, the Orchestrator reads results and proceeds

**Delegation prompt contents:**
- Task ID, name, type, description, epic ID
- Path to agent persona file (`.claude/agents/<agent>.md`)
- File paths to relevant artifacts (from `artifact_list`, curated per step)
- List of source files to review (accumulated from previous task summaries)
- Return protocol instructions (set in_progress, do work, register artifacts, set done)

**Why delegation improves output quality:**
- Each child session gets a **fresh context window** with only relevant context (~20-40K tokens vs. 200K+ accumulated)
- No context compaction artifacts — earlier decisions aren't lossy-compressed
- The codebase serves as shared truth — each child reads actual files, not conversation memory
- Failure is isolated — a crashed child loses only one task's work

**What the Orchestrator handles directly (never delegated):**
- Human review tasks (user interaction)
- Follow-up task creation and blocker management
- Loop iteration counting and hard limit enforcement
- Triage routing decisions (reading Critic results, creating appropriate next tasks)
- Code undo before rebuilds (`git checkout` + file deletion)
- Crash recovery (orphaned task detection)

**File tracker:**
The Orchestrator maintains a running list of files created/modified by child sessions. This allows each subsequent child to review relevant established patterns without scanning the entire codebase.

## Open Questions
1. ~~How does the Orchestrator persist workflow state so it can survive process restarts? Is the task tree in the database sufficient, or do we need additional state?~~ **Resolved** — The task tree in the database is sufficient. An epic's progress is fully represented by its tasks' statuses — `done` tasks are complete, `open` tasks are ready, `blocked` tasks are waiting. On restart, `next_task` picks up where the process left off. Loop iteration counts are derived from the task tree (count completed sibling tasks of the same type under the parent). **Crash recovery**: On startup, the Orchestrator checks for any `in_progress` tasks. These are orphaned from a previous crash. For each, the Orchestrator sets the orphaned task's status to `orphaned` (a terminal state) and creates a new replacement task with additional context explaining that a previous attempt appears to have failed, so the agent should carefully examine the state of the file system to determine what, if anything, was already done.
2. ~~How does the Orchestrator notify the user when it needs human input? CLI prompt? Log message? Webhook?~~ **Resolved** — CLI prompt. MAPS is a CLI application. When the Orchestrator encounters a human review step, it prints context about what needs review and prompts the user for input directly in the terminal.
3. ~~How does the user resume the workflow after completing a human review task?~~ **Resolved** — There is no separate resume mechanism. The Orchestrator runs in the terminal and blocks with a CLI prompt during human review steps. The user provides their input (review feedback, answers to open questions, sign-off), the Orchestrator records it and continues. If the user kills the process during a human review step, the task remains `open` in the database, and on restart the Orchestrator picks it up via `next_task` and re-prompts.
4. ~~What triggers the Orchestrator to start? A CLI command? An API call?~~ **Resolved** — The user invokes the `/maps` Claude Code custom command (e.g., `/maps I want to build a stock market investment tracking system`). This loads the command markdown, which instructs Claude to begin the workflow. On subsequent invocations (after a crash or session end), `/maps` calls `next_task` and picks up where things left off.
5. ~~Should the Orchestrator run as a long-lived process, or be invoked on demand (e.g., run one step at a time)?~~ **Resolved** — The Orchestrator is not a separate process. It is Claude Code following the `/maps` command instructions within a conversation session. It runs for as long as the Claude Code session is active. If the session ends, the user starts a new session and re-invokes `/maps` to continue.
6. ~~How does the Orchestrator handle the "undo" of code changes before a rebuild? Does it run git commands directly, or delegate to a utility?~~ **Resolved** — Claude uses direct git and file system access. Modified files are reverted via `git checkout`, and new files are deleted from the file system. No separate utility or abstraction is needed — Claude already has full access to both git and the file system via its built-in tools.
7. ~~How does the Orchestrator determine success criteria for each agent's loop? Are these defined per-agent, per-task-type, or globally?~~ **Resolved** — Per-task-type, defined in the `/maps` command instructions. Examples: critical review loop succeeds when the Critic finds zero new open questions; test/fix loop succeeds when all tests pass; spec review loop succeeds when the user signs off. Success criteria are inherent to the workflow step, not the agent role — the same agent may be invoked in different contexts with different criteria.
8. ~~What are the default hard limits for each type of loop (review loops, test/fix loops)?~~ **Resolved** — Default hard limits: (1) **Critical review loop** (Critic finds questions → user answers → Critic re-reviews): 3 iterations. If the Critic is still finding new questions after 3 rounds, something deeper is wrong and needs human intervention. (2) **Test/fix loop** (test → triage → fix → retest): 5 iterations. Code fixes can take a few attempts. (3) **Spec review loop** (user feedback → revise → re-review): no hard limit — this is human-driven and ends when the user signs off.
9. ~~Should the Orchestrator support running multiple non-blocking agents in parallel (e.g., building independent implementation plans simultaneously)?~~ **Resolved** — Sequential execution with session delegation. Each agent task is delegated to a fresh child session via the Task tool (`subagent_type="general-purpose"`), one at a time. This gives each task a focused context window without the complexity of parallel execution (git conflicts, concurrent DB access, cross-task coherence issues). The task tree's dependency system ensures `next_task` returns the right next task. True parallel execution (multiple simultaneous children) was considered but rejected — the sequential model avoids git conflicts and ensures each subsequent child can see the actual code produced by previous children.

## Dependencies
- [04-agents.md](04-agents.md) — The `/maps` command activates agent personas defined in the agent framework.
- [03-mcp-server.md](03-mcp-server.md) — Claude Code uses the MCP server tools for all task, blocker, and artifact management.
- [07-workflow.md](07-workflow.md) — The `/maps` command implements the workflow steps defined here.
