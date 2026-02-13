# MAPS Specification: Test Writer Agent

## Status: Draft

## Overview
The Test Writer agent writes unit tests from the specification and acceptance criteria, and revises tests when the Critic determines a test was wrong during failure triage. It works from the spec (intended behavior) against the code (actual implementation), providing an independent verification perspective.

## Workflow Steps
- **Step 16**: Write unit tests from the specification and acceptance criteria, then run them against the built code
- **Step 17d**: Revise tests when the Critic determines the test was at fault

## Inputs
- Specification and acceptance criteria (for writing tests)
- Implementation code (the code under test — function signatures, class structures, interfaces)
- Implementation plan (for understanding intended behavior)
- Critic's triage feedback (for test revision — what's wrong with the test)

## Outputs
- Unit test files (written to the project directory)
- Test results artifact (stored in `.maps/docs/<epic-slug>/reviews/`)

## Design Rationale
The Test Writer is deliberately separate from the Developer because:
- A **spec-first** perspective produces tests that verify intended behavior, not just confirm actual behavior
- A **distinct persona** with different instructions and mindset avoids bias toward happy paths that the Developer persona may have
- An **adversarial mindset** focused on edge cases, boundary conditions, and failure modes produces more thorough tests

## Success Criteria
- Every acceptance criterion in the spec has at least one corresponding test. No hard code coverage target — acceptance criteria coverage is the measure.
- Writing tests (step 16) and writing integration tests (step 18) are single-pass tasks. Test revision (step 17d) is managed by the `/maps` command within the 5-iteration test/fix loop.

## Behavioral Guidelines
- The Test Writer handles both unit tests (step 16) and integration tests (step 18). Same agent persona, different task type.
- Test framework is determined by the project's language/stack. The persona instructions direct Claude to discover the project's existing test framework, or choose a standard one if none exists.
- For code that depends on external services or databases, use standard test patterns: mocks, stubs, and test doubles.
- When revising a test, the Test Writer receives the Critic's specific triage feedback (what's wrong with the test and why) as input. It does not re-evaluate from scratch.

## Open Questions
1. ~~What are the specific inputs and outputs for each of this agent's tasks?~~ **Resolved** — Already defined in this spec. Inputs: specification and acceptance criteria, implementation code, implementation plan, Critic's triage feedback. Outputs: unit test files and test results artifact.
2. ~~What are the success criteria for written tests? Code coverage targets? Acceptance criteria coverage?~~ **Resolved** — Every acceptance criterion in the spec has at least one corresponding test. No hard code coverage target — acceptance criteria coverage is the measure.
3. ~~What are reasonable hard limits for this agent's iterations?~~ **Resolved** — Not applicable. Writing tests (step 16) is single-pass. Test revision (step 17d) is managed by the `/maps` command within the 5-iteration test/fix loop.
4. ~~What test framework should be used? (May depend on the project's language/stack)~~ **Resolved** — Determined by the project's language/stack. The Test Writer persona instructions direct Claude to discover the project's existing test framework, or choose a standard one if none exists.
5. ~~Should the Test Writer also write integration tests, or only unit tests?~~ **Resolved** — Both. Unit tests in step 16, integration tests in step 18. Same agent persona, different task type. See [07-workflow.md](07-workflow.md) resolved question #3.
6. ~~How does the Test Writer handle tests for code that depends on external services or databases?~~ **Resolved** — Use standard test patterns: mocks, stubs, and test doubles for external services and databases. The persona instructions guide this.
7. ~~When revising a test, does the Test Writer get the Critic's specific feedback about what's wrong, or does it re-evaluate from scratch?~~ **Resolved** — The Test Writer receives the Critic's specific triage feedback (what's wrong with the test and why) as input. It does not re-evaluate from scratch.

## Dependencies
- [04-agents.md](04-agents.md) — General agent framework
- [04d-agent-critic.md](04d-agent-critic.md) — Critic triages failures and may route back to Test Writer
