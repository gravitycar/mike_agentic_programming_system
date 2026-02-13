# MAPS Specification: Critic Agent

## Status: Draft

## Overview
The Critic agent performs critical reviews at multiple points in the workflow, identifying open questions, gaps, and issues. It also triages test failures to determine whether the code or the tests are at fault.

## Workflow Steps
- **Step 5**: Critical Review #1 — review the specification, add open questions for unaddressed concerns
- **Step 8**: Critical Review #2 — review the revised spec for new or still-unaddressed open questions
- **Step 13**: Critical Review #3 — review each implementation plan against the spec and previously resolved open questions
- **Step 17a**: Test failure triage — review failing tests against the spec, acceptance criteria, and code to determine cause

## Inputs
- Specification (for reviews #1 and #2)
- Previously resolved open questions (for review #3)
- Implementation plans (for review #3)
- Failing test output, test code, implementation code, and relevant spec sections (for triage)

## Outputs
- Open questions (created as `question` tasks in the database)
- Review summary artifacts (stored in `.maps/docs/<epic-slug>/reviews/`)
- Triage determination: code is wrong, test is wrong, or both (for test failure triage)

## Test Failure Triage
When tests fail, the Critic reviews:
1. The failing test output (error messages, stack traces)
2. The test code itself
3. The implementation code under test
4. The relevant specification and acceptance criteria

The Critic determines:
- **Code is wrong** → routes to Reviser → Developer rebuild → re-test
- **Test is wrong** → routes to Test Writer for revision → re-test
- **Both are wrong** → code fix first, then test revision → re-test

## Success Criteria
- Single-pass per review task. The Critic reviews the document, identifies open questions, and produces a review summary. It doesn't loop — the review loop is managed by `/maps` (Critic → user → revise → Critic again, up to 3 iterations).

## Behavioral Guidelines
- The Critic checks the spec's "Out of Scope" section before raising a question. If a concern is explicitly listed as out of scope, it is not an open question.
- The Critic receives previously resolved open questions as context (via `artifact_list`) to avoid re-raising concerns that have already been addressed.

### Test Failure Triage Heuristics
Compare the test's assertions against the spec's acceptance criteria:
- If the test expects behavior that matches the spec but the code doesn't deliver it → **code is wrong**
- If the test expects behavior that contradicts or goes beyond the spec → **test is wrong**
- If both deviate from the spec → **both are wrong**

## Open Questions
1. ~~What are the specific inputs and outputs for each of this agent's review tasks?~~ **Resolved** — Already defined in this spec. Inputs: specification, resolved open questions, implementation plans, failing test output/code. Outputs: open questions (as `question` tasks), review summary artifacts, triage determinations.
2. ~~What are the success criteria for a critical review? How does the Critic know when it has found all the open questions?~~ **Resolved** — Single-pass per review task. The Critic reviews the document, identifies open questions, and produces a review summary. It doesn't loop — the review loop is managed by `/maps` (Critic → user → revise → Critic again, up to 3 iterations).
3. ~~What are reasonable hard limits for this agent's iterations?~~ **Resolved** — Not applicable for the Critic itself. It runs once per review task. Loop limits are managed by the `/maps` command.
4. ~~How does the Critic distinguish between a genuine gap and an intentional omission (something listed in "Out of Scope")?~~ **Resolved** — The Critic persona instructions direct it to check the spec's "Out of Scope" section before raising a question. If a concern is explicitly listed as out of scope, it is not an open question.
5. ~~For test failure triage, what heuristics should the Critic use to determine whether code or tests are at fault?~~ **Resolved** — Compare the test's assertions against the spec's acceptance criteria. If the test expects behavior that matches the spec but the code doesn't deliver it → code is wrong. If the test expects behavior that contradicts or goes beyond the spec → test is wrong. If both deviate from the spec → both are wrong.
6. ~~Should the Critic review its own previous open questions to avoid raising the same concern twice?~~ **Resolved** — Yes. The Critic receives previously resolved open questions as context (via `artifact_list`) to avoid re-raising concerns that have already been addressed.

## Dependencies
- [04-agents.md](04-agents.md) — General agent framework
- [04b-agent-architect.md](04b-agent-architect.md) — Architect produces specs that the Critic reviews
- [04c-agent-developer.md](04c-agent-developer.md) — Developer produces code that the Critic triages
- [04e-agent-test-writer.md](04e-agent-test-writer.md) — Test Writer produces tests that the Critic triages
