# MAPS Specification: Developer Agent

## Status: Draft

## Overview
The Developer agent handles both the detailed planning and the actual code implementation. It writes implementation plans with code examples and unit test specifications, and then builds the code from those plans.

## Workflow Steps
- **Step 12**: Write implementation plans for each item in the implementation catalog (using research summaries and specification available via `artifact_list`)
- **Step 15**: Build code from each implementation plan
- **Step 17c**: Rebuild code from a revised implementation plan (after test failure triage)

## Inputs
- Implementation catalog item (from Architect, via `artifact_list`)
- Specification (from Architect, via `artifact_list`)
- Research summaries (from Researcher, via `artifact_list`)
- Implementation plan (for step 15 — building code from the plan it wrote)
- Revised implementation plan (for step 17c — from Reviser)

## Outputs
- Implementation plan artifacts (stored in `.maps/docs/<epic-slug>/plans/`)
- Source code files (written to the project directory)

## Success Criteria
- **Implementation plan**: Detailed enough to build code from without ambiguity. Should include code examples, file paths, function signatures, and unit test specifications. The Critic validates completeness in step 13.
- **Built code**: Runs without syntax/compilation errors and passes linting. Functional correctness is validated by the Test Writer in step 16, not by the Developer.
- Steps 12 and 15 are single-pass tasks. The test/fix loop (step 17c) has a 5-iteration hard limit managed by the `/maps` command.

## Behavioral Guidelines
- The task tree handles dependencies between implementation plans via blockers. Plans are built in dependency order — if plan B depends on code from plan A, the task for building B is blocked by the task for building A. The Architect notes these dependencies in the catalog, and they become blocker relationships.
- The Developer does not run smoke tests after building. All testing goes through the Test Writer to maintain separation of concerns.

## Open Questions
1. ~~What are the specific inputs and outputs for each of this agent's tasks?~~ **Resolved** — Already defined in this spec. Inputs: catalog items, spec sections, research sections, implementation plans, revised plans. Outputs: implementation plan artifacts and source code files.
2. ~~What are the success criteria for an implementation plan? How detailed should it be?~~ **Resolved** — Detailed enough to build code from without ambiguity. Should include code examples, file paths, function signatures, and unit test specifications. The Critic validates completeness in step 13.
3. ~~What are the success criteria for built code? Compiles? Passes linting?~~ **Resolved** — Code runs without syntax/compilation errors and passes linting. Functional correctness is validated by the Test Writer in step 16, not by the Developer.
4. ~~What are reasonable hard limits for this agent's iterations?~~ **Resolved** — Not applicable for single-pass tasks (steps 12 and 15). The test/fix loop (step 17c) has its own hard limit of 5 iterations managed by the `/maps` command.
5. ~~How does the Developer handle implementation plans that depend on code from other plans that haven't been built yet?~~ **Resolved** — The task tree handles this via blockers. Plans are built in dependency order — if plan B depends on code from plan A, the task for building B is blocked by the task for building A. The Architect notes these dependencies in the catalog, and they become blocker relationships in the task tree.
6. ~~Should the Developer run any immediate smoke tests after building, or does all testing go through the Test Writer?~~ **Resolved** — No smoke tests. All testing goes through the Test Writer. The Developer builds faithfully from the plan. Having the Developer also test would blur the separation of concerns.

## Dependencies
- [04-agents.md](04-agents.md) — General agent framework
- [04b-agent-architect.md](04b-agent-architect.md) — Architect provides catalog items and context
- [04f-agent-reviser.md](04f-agent-reviser.md) — Reviser provides revised plans after failures
