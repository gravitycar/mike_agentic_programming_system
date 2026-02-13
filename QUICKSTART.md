# MAPS Quick Start Guide

Get started with MAPS in 5 minutes.

## Prerequisites

- Node.js (v18+)
- Claude Code CLI

## Step 1: Build MAPS

```bash
cd /path/to/mike_agentic_programming_system
npm install
npm run build
```

You should see compiled output in `dist/`.

## Step 2: Set Up Your Project

Navigate to the project where you want to use MAPS:

```bash
cd /path/to/your/project
```

Run the MAPS setup script:

```bash
/path/to/mike_agentic_programming_system/maps-init.sh
```

This copies agent personas, the `/maps` command, and configures the MCP server.

## Step 3: Restart Claude Code

For Claude Code to load the MCP server, you need to restart:

```bash
# If Claude Code is running, quit it
# Then restart Claude Code
claude
```

## Step 4: Start Your First MAPS Project

In Claude Code, invoke `/maps` with your problem description:

```
/maps I want to add a simple TODO list feature to track tasks
```

MAPS will:
1. ✓ Create an epic task
2. ✓ Analyze your codebase
3. ✓ Research the problem domain
4. ✓ Write a specification
5. ✓ Ask you to review and resolve open questions
6. ✓ Build implementation plans
7. ✓ Generate code
8. ✓ Write and run tests
9. ✓ Iterate until all tests pass

## What to Expect

### Phase 1: Research (Steps 2-3)

MAPS will:
- Examine your codebase to understand existing patterns
- Search the web for best practices
- Create two research summary documents

**You do nothing** - just watch.

### Phase 2: Specification (Steps 4-10)

MAPS will:
- Write a detailed specification from research
- Critically review it to find gaps
- Present open questions to you
- Wait for your answers
- Iterate until you approve the spec

**You participate** - answer questions, review the spec, sign off.

Example questions you might see:
```
Question 1: Should completed tasks be deletable or just marked as done?
Options:
  A) Deletable (permanent removal)
  B) Mark as done (soft delete, can restore)
  C) Both options available

Your answer: B
```

### Phase 3: Implementation (Steps 11-15)

MAPS will:
- Break the spec into discrete catalog items
- Write detailed implementation plans with code examples
- Build the code from those plans

**You do nothing** - just watch the code appear.

### Phase 4: Testing (Steps 16-19)

MAPS will:
- Write unit tests from acceptance criteria
- Run the tests
- If failures: triage, fix plans, rebuild, re-test
- Repeat for integration tests

**You do nothing** - the test/fix loop is automated.

## Common First-Time Questions

**Q: Where does MAPS store its work?**

A: In `.maps/` directory within your project:
```
.maps/
├── maps.db                 # SQLite database (workflow state)
└── docs/
    └── <epic-slug>/        # Epic-specific documents
        ├── research/
        ├── specification/
        ├── catalog/
        ├── plans/
        └── reviews/
```

**Q: Can I stop and resume?**

A: Yes! MAPS saves all progress in the database. Just invoke `/maps` again and it picks up where it left off.

**Q: What if Claude crashes mid-task?**

A: MAPS has crash recovery. On restart, it detects orphaned tasks, marks them as such, and creates replacement tasks.

**Q: Can I use MAPS on multiple epics in the same project?**

A: Yes, but one at a time. Set the current epic with `config_set key="current_epic_id" value="<epic-id>"`.

**Q: How do I see what tasks are pending?**

A: Ask Claude: "Show me the current MAPS tasks" or call `task_list` directly.

**Q: What if I disagree with the spec?**

A: During review steps (6-7, 9-10, 14), you can request changes. MAPS will revise and re-review.

**Q: What if tests keep failing?**

A: The test/fix loop has a 5-iteration hard limit. After that, MAPS pauses and asks for your help.

## Example Session

Here's what a real session looks like:

```
You: /maps Add user authentication with JWT tokens

MAPS: [Creates epic, initializes database]
      Starting Step 2: Codebase Analysis...
      [Examines your files, writes summary]

      Starting Step 3: Web Research...
      [Searches for JWT best practices, writes summary]

      Starting Step 4: Writing Specification...
      [Writes detailed spec with acceptance criteria]

      Starting Step 5: Critical Review #1...
      [Reviews spec, finds 3 open questions]

      Open Questions:
      1. Token expiration time: 15min, 1h, or 24h?
      2. Refresh token support: Yes or No?
      3. Password reset flow: In scope or Phase 2?

You:  1. 24 hours
      2. No, not yet
      3. Phase 2

MAPS: [Updates spec, runs Critical Review #2]
      No new open questions found.

      Please review the specification at:
      .maps/docs/add-user-auth-jwt/specification/spec.md

      Type "approved" to sign off and proceed to implementation.

You:  approved

MAPS: [Commits spec to git]
      [Builds implementation catalog: 4 items]
      [Writes 4 implementation plans]
      [Critical Review #3: no issues]
      [Builds code from plans]
      [Writes and runs 12 unit tests]
      ✓ All tests passed!
      [Writes and runs 3 integration tests]
      ✓ All tests passed!

      Epic complete! Summary:
      - 4 implementation items built
      - 15 tests written
      - 100% tests passing
```

## Tips for Success

1. **Be specific in your problem description**
   - Good: "Add JWT authentication with 24-hour token expiration"
   - Vague: "Add auth"

2. **Answer open questions thoughtfully**
   - These decisions affect the entire implementation
   - You can always revise the spec if you change your mind

3. **Review the spec before signing off**
   - MAPS won't show it to you again
   - This is your chance to catch issues early

4. **Trust the process**
   - The spec-first approach feels slow at first
   - But it saves massive rework later

5. **Use the guidelines**
   - `.maps/guidelines/SPECIFICATION_GUIDELINES.md`
   - `.maps/guidelines/IMPLEMENTATION_PLAN_GUIDELINES.md`

## Next Steps

- Read `CLAUDE.md` for system architecture
- Read `docs/specs/` for detailed specifications
- Review the generated documents in `.maps/docs/<your-epic>/`
- Experiment with different problem descriptions

## Getting Help

If something goes wrong:

1. Check the MCP server logs (if running in debug mode)
2. Check the SQLite database: `.maps/maps.db` (use `sqlite3` CLI)
3. Read the task results: `task_get task_id=<id>` shows what happened
4. Review the CLAUDE.md file for architecture understanding

## What's Next?

Once you're comfortable with basic usage:

- Try more complex epics (multi-component systems)
- Experiment with different specification styles
- Customize agent personas for your team's workflow
- Integrate MAPS into your development process

Happy building with MAPS!
