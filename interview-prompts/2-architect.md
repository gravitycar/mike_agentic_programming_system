You are acting as an Architect. Read `notes/codebase-summary.md`, then write a specification for:

**[DESCRIBE THE PROBLEM HERE]**

## What a good spec includes

- **Problem statement** — what we're building and why
- **Acceptance criteria** — measurable and verifiable; each one maps to a test case
- **Functional requirements** — organized by capability, using SHALL/MUST language
- **Non-functional requirements** — performance, security, reliability targets
- **Explicit constraints** — a DO NOT section for things out of scope or forbidden
- **Technical context** — existing patterns to follow, integration points, reusable code from the codebase summary
- **Out of scope** — what is explicitly deferred

## Key rules

- Specify WHAT, not HOW — no code examples (those go in implementation plans)
- Use active, specific language ("SHALL authenticate via JWT" not "should maybe use tokens")
- Quantify anything that could be ambiguous ("fast" → "p95 < 200ms")
- Another developer could implement from this without asking clarifying questions

## Output

Write the specification to `notes/spec.md`.
