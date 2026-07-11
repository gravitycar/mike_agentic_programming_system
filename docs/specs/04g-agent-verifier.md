# MAPS Specification: Verifier Agent

## Status: Draft

## Overview
The Verifier agent performs **acceptance verification** (Step 20): it confirms that each Acceptance Criterion in the specification is actually met by the built system, and records the strength of the evidence. It is a judgment-only agent — it interprets results, performs inspection-based checks, and confirms Acceptance Criteria. It authors no code and orchestrates nothing.

The Verifier exists because acceptance verification requires methods and judgment the Test Writer's unit/integration focus does not cover: interpreting a benchmark against a threshold, judging a rendered/visual artifact, and inspecting code/artifacts for structural properties — plus rolling per-test evidence up into a per-criterion verdict.

## Workflow Steps
- **Step 20a**: Verify judgment-based MAPS-owned Acceptance Tests — interpret non-deterministic results (benchmark analysis, screenshot/visual judgment) and perform inspection-method checks. Deterministic Acceptance Tests are run by the Test Writer; the Verifier consumes their results.
- **Step 20c**: Confirm Acceptance Criteria — when an AC's Acceptance Test tasks are all `done`, record the verification evidence and rolled-up confidence, and mark the AC `done`.

## Inputs
- Specification — Acceptance Criteria (IDs, names, owners) and the slim Acceptance Tests map
- Implementation plans — `Acceptance Criteria Verification` tables and `Manual Verification Procedures`
- Test results from the Test Writer
- Built code and produced artifacts (screenshots, benchmark output, reports), via file system access

## Outputs
- Acceptance verification records in task `results` (per AT judged, per AC confirmed)
- Acceptance verification report artifact (`.maps/docs/<epic-slug>/reviews/acceptance-verification-[timestamp].md`)

## Design Rationale
The Verifier is separate from the Test Writer and the Critic because:
- The **Test Writer** authors and runs executable tests (unit, integration, and any executable acceptance checks). The Verifier authors no code.
- The **Critic** triages *why* a failure happened. The Verifier judges *whether* an acceptance criterion is met.
- Acceptance verification is a distinct mindset — proving criteria against the whole built system, with explicit confidence, rather than exercising individual code units.

Keeping the Verifier judgment-only holds the persona thin and keeps code-authoring with a single specialist (the Test Writer), avoiding two personas that write test code.

## Verification Confidence
Every completed Acceptance Test carries a confidence level, recorded with its evidence, to prevent "green-checkmark theater":
- **Confirmed** — deterministic executed evidence (test/benchmark/headless-UI check ran and passed).
- **Asserted** — judged to hold by inspection/interpretation, with no executed pass.
- **User-confirmed** — a human performed the manual procedure and signed off.

Confidence is an **attribute** stored in the task `results` field — not a new task status. The forward-only status lifecycle is unchanged and no schema change is required. An Acceptance Criterion's confidence is the **weakest** of its Acceptance Tests' (Confirmed only if all ATs are Confirmed). Asserted ACs are surfaced but do not block Epic completion.

## Success Criteria
- Every MAPS-owned Acceptance Test the Verifier is responsible for is judged with clear evidence and a confidence level.
- Every confirmed AC has a verification record and rolled-up confidence in its `results`.
- The Verifier never marks an AC `done` while any of its ATs is not `done`.
- The Verifier authors no code and triages no failures; failed Acceptance Tests are reported for the Critic to triage.
- Single-pass per task. The Step-20 verify/fix loop has a 5-iteration hard limit managed by the `/maps` command (the same limit as steps 17/19).

## Behavioral Guidelines
- **Tool-agnostic**: describe verification methods abstractly (automated test, benchmark, headless UI drive, inspection); never assume a specific tool. The concrete tool is chosen in the implementation plan for the target project. If a needed method cannot be run in the project, say so rather than inventing tooling.
- **Failures are reported, not fixed**: a judged failure is returned with reasoning; the orchestrator delegates triage to the Critic. A failure is never a status — an Acceptance Test task is `done` only when it passes.
- **Confirmation is defensive**: before completing an AC, the Verifier re-checks that every AT is genuinely `done`; if not, it refuses and surfaces the inconsistency.
- **Cross-cutting ACs** (tagged `**Scope:** cross-cutting` in the spec) are verified via their dedicated verification catalog item's plan, but confirmed and scored exactly like any other AC.

## Open Questions
1. ~~What are the Verifier's inputs and outputs?~~ **Resolved** — Defined above. Inputs: spec ACs/tests, plan verification tables and manual procedures, Test Writer results, built artifacts. Outputs: verification records in task `results` and a verification report artifact.
2. ~~Does the Verifier run tests?~~ **Resolved** — No executable authoring or running. The Test Writer authors and runs all executable tests (including benchmark/headless-UI checks). The Verifier interprets non-deterministic results, performs inspection-method checks, and confirms ACs.
3. ~~How does the Verifier handle a failed Acceptance Test?~~ **Resolved** — Reports it with reasoning; the orchestrator routes it to the Critic for triage. The Verifier does not fix code, tests, or plans.
4. ~~How is verification strength represented without breaking the forward-only lifecycle?~~ **Resolved** — Confidence (Confirmed / Asserted / User-confirmed) is an attribute in the task `results` field, not a new status. AC confidence rolls up to the weakest AT. No schema change.
5. ~~What is the Verifier's hard limit?~~ **Resolved** — Single-pass per task; the Step-20 verify/fix loop's 5-iteration hard limit is managed by `/maps`.

## Dependencies
- [04-agents.md](04-agents.md) — General agent framework
- [04b-agent-architect.md](04b-agent-architect.md) — Architect defines Acceptance Criteria, Acceptance Tests, and cross-cutting verification catalog items
- [04c-agent-developer.md](04c-agent-developer.md) — Developer's plans hold the Acceptance Criteria Verification tables and manual procedures
- [04d-agent-critic.md](04d-agent-critic.md) — Critic triages Acceptance Test failures the Verifier reports
- [04e-agent-test-writer.md](04e-agent-test-writer.md) — Test Writer authors and runs the executable Acceptance Tests
- [07-workflow.md](07-workflow.md) — Defines Step 20 and its verify/fix loop
