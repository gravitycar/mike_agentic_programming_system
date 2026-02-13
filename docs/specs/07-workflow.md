# MAPS Specification: Workflow

## Status: Draft

## Overview
The workflow defines the end-to-end pipeline from a user's initial problem statement through tested, working code. It specifies the sequence of steps, which agent handles each step, decision points, loops, and human interaction points.

## Context
From the initial design notes, the workflow has 17 steps:

1. **User** — Describes the problem statement/goal
2. **Agent** — Takes stock of current codebase state. Summarize.
3. **Agent** — Search the web for articles about the problem domain. Summarize.
4. **Agent** — Write a specification document from a template and guidelines. No code examples. Include acceptance criteria.
5. **Agent** — Critical Review #1. Add "Open Questions" section for unaddressed questions.
6. **User** — Review spec. Provide feedback/changes/corrections.
7. **User** — Review and resolve all open questions.
8. **Agent** — Critical Review #2. Review for new or still-unaddressed open questions.
9. **User** — Address open questions.
10. **User** — Sign off on spec. Approved spec is committed in git before implementation begins.
11. **Agent** — Build implementation catalog. Discrete items, no code examples, max ~3 files each.
12. **Agent** — Create implementation plans for every catalog item. Code examples welcome. Include unit tests. Note blocking dependencies between plans.
13. **Agent** — Critical Review #3. Review each implementation plan against previously answered open questions.
14. **User** — Review and resolve remaining open questions.
15. **Agent** — Build each implementation plan.
16. **Agent** — Run unit test suite.
17. **Agent** — Review test results. For failures: update plan, undo changes, rebuild, retest.
18. **Agent** — Write and run integration tests.
19. **Agent** — Review integration test results. For failures: same triage/fix loop as step 17.

## Requirements
- Steps must execute in order, with explicit blocking between phases
- All execution is sequential — Claude works through tasks one at a time within a single conversation
- Human review steps must pause the workflow until the user provides input
- Critical review loops (steps 5-9) must repeat until the Critic finds zero new open questions AND the user signs off. Hard limit: 3 iterations.
- Implementation and test loops (steps 15-17, 18-19) have a hard limit of 5 iterations
- Integration testing (steps 18-19) follows the same triage/fix loop pattern as unit testing
- Each step must update task status in the database via the MCP server
- Code undo before rebuild: when a test failure requires rebuilding, Claude reverts modified files via `git checkout` and deletes new files before rebuilding from a revised plan
- Workflow state is persisted entirely in the task tree. On re-invocation, `/maps` calls `next_task` to pick up where things left off

### Open Question Resolution Process
Open questions are resolved interactively, one at a time, in a conversation between the user and the agent. The agent presents a question, the user and agent discuss it until they reach a resolution, and then the resolution is recorded before moving to the next question. This deliberate, sequential process forces the engineer to engage with the spec and understand it deeply — rather than rubber-stamping a batch of questions. Each resolved question may update the specification or other documents. This is the same pattern used when building these MAPS specs themselves.

### Revisiting Earlier Phases
The workflow follows a forward-only status lifecycle — completed tasks are never reopened. If the user wants to go back (e.g., revise the spec after seeing implementation plans), new tasks are created: a new spec revision task, a new review cycle, and potentially new implementation plan tasks that supersede the old ones. The user initiates this during any human review step by telling Claude they want to revisit an earlier phase. The `/maps` command instructions should account for this as a valid user action.

## Open Questions
1. ~~How does the system pause and resume for human interaction steps (6, 7, 9, 10, 14)? Is this a CLI prompt, a status the user checks, or something else?~~ **Resolved** — Claude presents questions and context directly in the Claude Code conversation. The user responds naturally — no special prefix or mechanism needed. See [05-orchestrator.md](05-orchestrator.md) resolved questions #2 and #3.
2. ~~Which specific agent role handles each step? (Map steps to Architect/Researcher/Developer/Critic/Test Writer/Reviser)~~ **Resolved** — See the Agent Roles and Workflow Mapping table in [04-agents.md](04-agents.md).
3. ~~Integration tests are mentioned in the initial goal statement but are absent from steps 1-17. Should there be a step 18+ for integration testing?~~ **Resolved** — Yes. After all unit tests pass, an integration testing phase follows the same pattern: Test Writer writes and runs integration tests, Critic triages failures, Reviser/Developer fix code or Test Writer revises tests, loop until passing or hard limit reached.
4. ~~Can implementation plans (step 15) be built in parallel if they don't block each other?~~ **Resolved** — No. Claude works through tasks sequentially within a single conversation. Independent plans are built one after the other. See [05-orchestrator.md](05-orchestrator.md) resolved question #9.
5. ~~How does step 17's "undo" work in practice? `git checkout` for modified files and `rm` for new files — is this sufficient? What about database migrations or other side effects?~~ **Resolved** — Claude uses `git checkout` to revert modified files and deletes new files from the file system. For the initial implementation, database migrations and other side effects are out of scope. See [05-orchestrator.md](05-orchestrator.md) resolved question #6.
6. ~~What triggers the workflow? A CLI command? A specific prompt to Claude Code?~~ **Resolved** — The `/maps` Claude Code custom command (e.g., `/maps I want to build a stock market investment tracking system`). See [05-orchestrator.md](05-orchestrator.md) resolved question #4.
7. ~~How is the workflow state persisted so it can survive process restarts?~~ **Resolved** — The task tree in the database. On re-invocation, `/maps` calls `next_task` and picks up where things left off. See [05-orchestrator.md](05-orchestrator.md) resolved question #1.
8. ~~Steps 6-9 describe a review loop, but the loop termination condition isn't explicit. Is it "zero open questions from Critical Review" AND "user sign-off"?~~ **Resolved** — Yes, both conditions must be met. The Critic must find zero new open questions, AND the user must sign off on the spec. The loop has a hard limit of 3 iterations. See [05-orchestrator.md](05-orchestrator.md) resolved questions #7 and #8.
9. ~~Should there be a step between 10 and 11 where the final spec is stored/versioned?~~ **Resolved** — No separate step needed. The spec is already versioned via artifact insert-new-row versioning. However, as part of user sign-off (step 10), the approved spec must be committed in git before implementation begins. This creates a clear snapshot of what was approved.
10. ~~What happens if the user wants to go back to an earlier step (e.g., revise the spec after seeing implementation plans)?~~ **Resolved** — The forward-only status lifecycle means completed tasks are never reopened. Instead, new tasks are created — a new spec revision task, a new review cycle, and potentially new implementation plan tasks that supersede the old ones. This is consistent with the "create a new task, don't reopen" philosophy. In practice, the user initiates this during a human review step by telling Claude they want to revisit an earlier phase. Claude creates the appropriate new tasks in the task tree. The `/maps` command instructions should account for this as a valid user action during any human review step.

## Dependencies
- [04-agents.md](04-agents.md) — The workflow activates agent personas; their roles and instructions must be defined.
- [03-mcp-server.md](03-mcp-server.md) — Workflow state is tracked via tasks in the database.
- [01-db-schema.md](01-db-schema.md) — Task statuses and hierarchy must support the workflow's needs.
