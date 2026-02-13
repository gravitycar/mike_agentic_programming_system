# MAPS Specification: Architect Agent

## Status: Draft

## Overview
The Architect agent designs the high-level structure of the project. It writes specifications from research and user input, and builds the implementation catalog that breaks the spec into discrete buildable items.

## Workflow Steps
- **Step 4**: Write specification document from research summaries and user input, following specification guidelines
- **Step 11**: Build implementation catalog — a concise list of discrete items to build, no code examples, max ~3 files each
- **Step 12 (context)**: The research summaries and specification produced by the Architect are available to the Developer via `artifact_list` when writing implementation plans

## Inputs
- Problem statement (epic description)
- Codebase summary (from Researcher)
- Research summary (from Researcher)
- Specification guidelines (`docs/guidelines/SPECIFICATION_GUIDELINES.md`)
- User feedback (during review loops)

## Outputs
- Specification artifact (stored in `.maps/docs/<epic-slug>/specification/`)
- Implementation catalog artifact (stored in `.maps/docs/<epic-slug>/catalog/`)

## Success Criteria
- **Specification**: Must include a clear problem statement, acceptance criteria, and follow the specification guidelines. Completeness is validated by the Critic in step 5, not self-assessed by the Architect.
- **Implementation catalog**: Every aspect of the spec is covered by a catalog item, each item is discrete (max ~3 files), and items have their blocking dependencies noted.
- Steps 4 and 11 are single-pass tasks. Iteration happens through the review loop (Critic → user → Architect revises), managed by the `/maps` command.

## Behavioral Guidelines
- If a specification exceeds the 10K token guideline, the Architect decomposes it into sub-sections stored as separate artifacts. The persona instructions guide this.
- Claude has access to all artifacts via `artifact_list` and the file system. The `/maps` command instructions tell Claude which documents are relevant for step 12.

## Open Questions
1. ~~What are the specific inputs and outputs for each of this agent's tasks?~~ **Resolved** — Already defined in this spec. Inputs: problem statement, codebase summary, research summary, specification guidelines, user feedback. Outputs: specification artifact and implementation catalog artifact.
2. ~~What are the success criteria for the specification? How do we know it's complete enough for review?~~ **Resolved** — The spec must include a clear problem statement, acceptance criteria, and follow the specification guidelines. Completeness is validated by the Critic in step 5, not self-assessed by the Architect.
3. ~~What are the success criteria for the implementation catalog?~~ **Resolved** — Every aspect of the spec is covered by a catalog item, each item is discrete (max ~3 files), and items have their blocking dependencies noted.
4. ~~What are reasonable hard limits for this agent's iterations?~~ **Resolved** — Not applicable. Steps 4 and 11 are single-pass tasks. The Architect writes the spec/catalog and is done. Iteration happens through the review loop (Critic → user → Architect revises), which is managed by the `/maps` command with its own hard limits.
5. ~~How does the Architect determine when a specification is too large and needs to be decomposed into multiple sub-specs (10K token limit)?~~ **Resolved** — If a spec exceeds the 10K token guideline, the Architect decomposes it into sub-sections stored as separate artifacts. The persona instructions guide this.
6. ~~How does the Architect select relevant context to pass to the Developer for implementation plan writing?~~ **Resolved** — With the Claude Code persona model, there is no manual context selection. Claude has access to all artifacts via `artifact_list` and the file system. The `/maps` command instructions tell Claude which documents are relevant for step 12.

## Dependencies
- [04-agents.md](04-agents.md) — General agent framework
- [04a-agent-researcher.md](04a-agent-researcher.md) — Researcher provides inputs to the Architect
