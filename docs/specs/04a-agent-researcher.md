# MAPS Specification: Researcher Agent

## Status: Draft

## Overview
The Researcher agent gathers context for the project by analyzing the current codebase and searching the web for relevant articles, documentation, and existing packages in the problem domain. It produces summaries that inform the Architect's specification work.

## Workflow Steps
- **Step 2**: Analyze current codebase state, produce a codebase summary
- **Step 3**: Search the web for articles about the problem domain, produce a research summary

## Inputs
- Problem statement from the user (epic description)
- Access to the project's file system (for codebase analysis)
- Web search capability

## Outputs
- Codebase summary artifact (stored in `.maps/docs/<epic-slug>/research/`)
- Research summary artifact (stored in `.maps/docs/<epic-slug>/research/`)

## Success Criteria
- Steps 2 and 3 are single-pass tasks, not loops. The Researcher produces its artifacts and the task is done. If the research was insufficient, it surfaces as open questions during the Critic's review downstream.

## Behavioral Guidelines
- Claude derives search terms from the problem statement; the user does not provide them. The Researcher persona instructions guide this process.
- Codebase analysis should produce an architecture summary, key file structure, dependencies, and relevant existing patterns. Not a full file listing — focused on what's relevant to the problem statement.
- The Researcher should actively search for existing packages that perform functions the project might otherwise build from scratch, and include findings in the research summary.
- Web search uses Claude Code's built-in web search capability. No separate API is needed.

## Open Questions
1. ~~What are the specific inputs and outputs for each of this agent's tasks?~~ **Resolved** — Already defined in this spec. Inputs: problem statement, file system access, web search. Outputs: codebase summary artifact and research summary artifact.
2. ~~What are the success criteria for this agent's work? How do we know the research is "good enough"?~~ **Resolved** — Steps 2 and 3 are single-pass tasks, not loops. The Researcher produces a codebase summary and a research summary, then the task is done. The Critic reviews the resulting spec downstream — if the research was insufficient, it surfaces as open questions during critical review.
3. ~~What are reasonable hard limits for this agent's iterations?~~ **Resolved** — Not applicable. Steps 2 and 3 are single-pass tasks, not loops.
4. ~~What web search tools/APIs does this agent use?~~ **Resolved** — Claude Code's built-in web search capability. No separate API needed.
5. ~~How does the agent determine what to search for? Does it derive search terms from the problem statement, or does the user provide them?~~ **Resolved** — Claude derives search terms from the problem statement. The Researcher persona instructions guide this process.
6. ~~How deep should codebase analysis go? Full file listing? Architecture summary? Dependency analysis?~~ **Resolved** — Architecture summary, key file structure, dependencies, and relevant existing patterns. Not a full file listing — focused on what's relevant to the problem statement.
7. ~~Should the Researcher also search for existing packages/libraries that could be used instead of building from scratch?~~ **Resolved** — Yes. The Researcher should actively search for existing packages that perform functions the project might otherwise build from scratch, and include findings in the research summary.

## Dependencies
- [04-agents.md](04-agents.md) — General agent framework
