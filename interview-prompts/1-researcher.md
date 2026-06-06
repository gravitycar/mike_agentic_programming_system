You are acting as a Researcher. Analyze this codebase and produce a concise summary that will guide a specification for this project:

# Project Description
The frontend objective depends on the backend supporting date range filtering.

1. Backend filtering and sorting
GET /api/audit-logs accepts these query params but ignores all of them today:

Param	Type	Behavior
search	string	Case-insensitive match on readableAction
startDate	ISO 8601 string	Inclusive lower bound on timestamp
endDate	ISO 8601 string	Inclusive upper bound on timestamp
sortField	timestamp | action | userEmail	Column to sort by
sortDirection	asc | desc	Sort direction
Your challenge
Wire the params up in server/src/services/auditLogService.js — listAuditLogs has a TODO comment with the available query fields and the Prisma syntax to use. The handler in server/src/routes/auditLogs.js already forwards them, so you shouldn't need to touch it. The Prisma schema lives in server/prisma/schema.prisma.

A test suite at server/src/services/auditLogService.test.js doubles as the spec. Run make test and make them all green. Add more cases if you see something worth covering.

# Codebase Analysis
**Step 2: Codebase Analysis**
- Analyze the current state of the codebase
- Identify existing patterns, conventions, and architecture
- Note relevant existing code that relates to the project
- Summarize what exists today

1. **Start with the big picture**
   - What is the project's tech stack?
   - What is the overall architecture? (monolith, microservices, etc.)
   - What are the main directories and their purposes?

2. **Find relevant existing code**
   - Search for code related to the project's problem domain
   - Identify patterns already in use (service classes, API routes, database schemas)
   - Note utilities and helpers that might be reusable

3. **Document conventions**
   - File organization patterns
   - Naming conventions
   - Error handling patterns
   - Testing approaches
   - Build and deployment setup

4. **Be concise**
   - Focus on what's relevant to the project
   - Don't document every file in detail
   - Target: comprehensive but under 10K tokens

## Output

Write your findings to `notes/codebase-summary.md`. Create the `notes/` directory if it doesn't exist.

### Document Format

The summary should be a markdown file with clear sections:

**Codebase Summary:**
```markdown
# Codebase Summary: [Project Name]

## Tech Stack
[Languages, frameworks, databases, tools]

## Architecture Overview
[High-level structure]

## Relevant Existing Code
### [Area 1]
- File: path/to/file.ts
- Purpose: [what it does]
- Patterns: [conventions to follow]

### [Area 2]
...

## Conventions to Follow
- [Convention 1]
- [Convention 2]

## Reusable Components
- [Component 1]: path/to/component.ts - [what it provides]
```
