# MAPS Specification: Reviser Agent

## Status: Draft

## Overview
The Reviser agent updates implementation plans after the Critic determines that code failures are due to problems in the plan. It takes the Critic's triage feedback, the failing test output, and the current implementation plan, and produces a revised plan that addresses the identified issues.

## Workflow Steps
- **Step 17b**: Revise the implementation plan based on the Critic's triage feedback, then hand off to the Developer for rebuilding

## Inputs
- Current implementation plan
- Critic's triage feedback (what's wrong with the code and why)
- Failing test output (error messages, stack traces)
- Relevant specification and acceptance criteria

## Outputs
- Revised implementation plan artifact (new version in `.maps/docs/<epic-slug>/plans/`)

## Design Rationale
The Reviser is separate from the Developer because:
- The Developer's job is to build faithfully from a plan
- The Reviser's job is to diagnose why a plan produced incorrect code and fix the plan
- These require different mindsets — construction vs. diagnosis

After the Reviser produces a revised plan, the Developer rebuilds from the updated plan and the Test Writer re-runs tests. The existing code changes are undone (via `git checkout` for modified files, deletion for new files) before rebuilding.

## Success Criteria
- Single-pass. The Reviser produces a revised plan that specifically addresses the Critic's identified issues. Whether the revision actually fixes the problem is validated when the Developer rebuilds and the Test Writer re-runs tests.
- The overall test/fix loop has a 5-iteration hard limit managed by the `/maps` command.

## Behavioral Guidelines
- The Reviser should have access to the original spec and acceptance criteria (via `artifact_list`), not just the immediate plan and failure. The spec is the source of truth for intended behavior.
- The Reviser notes in the revised plan any parts that may be affected by the change, but focuses on the identified failure first. If the fix introduces new failures, they surface in the next test run and go through triage again.
- The `/maps` command handles git operations (checkout modified files, delete new files) before the Developer rebuilds. The Reviser only revises the plan — it does not touch code or git.

## Open Questions
1. ~~What are the specific inputs and outputs for this agent's task?~~ **Resolved** — Already defined in this spec. Inputs: current implementation plan, Critic's triage feedback, failing test output, specification and acceptance criteria. Outputs: revised implementation plan artifact.
2. ~~What are the success criteria for a revised plan? How does the Reviser know the revision addresses the failure?~~ **Resolved** — Single-pass. The Reviser produces a revised plan that specifically addresses the Critic's identified issues. Whether the revision actually fixes the problem is validated when the Developer rebuilds and the Test Writer re-runs tests.
3. ~~What are reasonable hard limits for this agent's iterations?~~ **Resolved** — Not applicable. The Reviser runs once per revision task. The overall test/fix loop has a 5-iteration hard limit managed by the `/maps` command.
4. ~~How does the Reviser handle cascading failures — where fixing one issue in the plan might affect other parts?~~ **Resolved** — The Reviser notes in the revised plan any parts that may be affected by the change, but focuses on the identified failure first. If the fix introduces new failures, they surface in the next test run and go through triage again.
5. ~~Should the Reviser also consider the Architect's original specification context, or only work from the immediate plan and failure?~~ **Resolved** — Yes, the Reviser should have access to the original spec and acceptance criteria (via `artifact_list`), not just the immediate plan and failure. The spec is the source of truth for intended behavior.
6. ~~How is the "undo" of code changes coordinated? Does the framework handle the git operations, or does the Reviser?~~ **Resolved** — The `/maps` command handles git operations (checkout modified files, delete new files) before the Developer rebuilds. The Reviser only revises the plan — it does not touch code or git. See [05-orchestrator.md](05-orchestrator.md) resolved question #6.

## Dependencies
- [04-agents.md](04-agents.md) — General agent framework
- [04d-agent-critic.md](04d-agent-critic.md) — Critic provides triage feedback to the Reviser
- [04c-agent-developer.md](04c-agent-developer.md) — Developer rebuilds from revised plans
