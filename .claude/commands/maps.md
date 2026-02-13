# MAPS - Mike's Agentic Programming System

You are executing the `/maps` command, which orchestrates a multi-step software development workflow from problem statement through tested, working code.

## How MAPS Works

MAPS is a **spec-driven development system** that front-loads design decisions through iterative specification writing and critical review before any code is written. The workflow has 19 steps organized into phases:

**Research → Specification → Review → Implementation Planning → Build → Test**

You coordinate the workflow by:
1. Finding the next task via `next_task`
2. Activating the appropriate agent persona for that task
3. Performing the work
4. Creating follow-up tasks as needed
5. Managing loops and human review points

## Workflow Steps (from 07-workflow.md)

1. **User** — Describes the problem statement/goal
2. **Researcher** — Analyzes current codebase state
3. **Researcher** — Searches web for domain articles
4. **Architect** — Writes specification document
5. **Critic** — Critical Review #1
6-7. **User** — Reviews spec + resolves open questions
8. **Critic** — Critical Review #2
9-10. **User** — Addresses questions + signs off (git commit)
11. **Architect** — Builds implementation catalog
12. **Developer** — Writes implementation plans
13. **Critic** — Critical Review #3
14. **User** — Resolves remaining questions
15. **Developer** — Builds code from plans
16. **Test Writer** — Writes and runs unit tests
17. **Critic/Reviser/Developer/Test Writer** — Test failure triage/fix loop
18. **Test Writer** — Writes and runs integration tests
19. **Critic/Reviser/Developer/Test Writer** — Integration test triage/fix loop

## Initial Setup

When the user invokes `/maps` with a problem description:

1. **Check for epic**: Call `epic_list active_only=true` to see if work is in progress
   - If an epic exists: Ask user if they want to continue or start fresh
   - If no epic: Proceed to create one

2. **Create the epic task**:
   ```
   task_create parent_id=null type="epic" name="[User's problem statement]" description="[Full description]" agent="user"
   ```
   (Note: For the root epic, parent_id should be omitted or a root task with id=0 should exist)

3. **Set current epic**:
   ```
   config_set key="current_epic_id" value="[epic-id]"
   ```

4. **Initialize project structure**:
   ```
   project_init project_path="[current working directory]"
   ```

5. **Create initial task chain** under the epic:
   - Research codebase (type="research", agent="researcher")
   - Research web (type="research", agent="researcher")
   - Block "Research web" by "Research codebase"
   - Write spec (type="specification", agent="architect")
   - Block "Write spec" by both research tasks

## Main Loop

After setup, enter the main workflow loop:

```
while (true) {
  // Find next work
  const task = next_task();

  if (!task) {
    // No open tasks — check if epic is complete
    const epicTasks = task_list(parent_id=epic_id);
    if (all tasks are 'done') {
      congratulate user, exit
    } else {
      // Tasks exist but all are blocked or in_progress
      // Check for orphaned in_progress tasks (crash recovery)
      handle_crash_recovery()
    }
  }

  // Activate agent persona
  const agent = task.agent;
  if (agent === "user") {
    handle_human_review(task);
  } else {
    activate_agent_persona(agent);
    execute_task(task);
  }
}
```

## Agent Persona Activation

When you encounter a task for an agent, load that agent's persona file:

| Agent | Persona File |
|-------|--------------|
| researcher | `.claude/agents/researcher.md` |
| architect | `.claude/agents/architect.md` |
| developer | `.claude/agents/developer.md` |
| critic | `.claude/agents/critic.md` |
| test_writer | `.claude/agents/test-writer.md` |
| reviser | `.claude/agents/reviser.md` |

**How to activate:**
1. Read the persona file from `.claude/agents/[agent].md`
2. Follow its instructions for the current task
3. The persona file tells you what inputs to retrieve, what to do, and what to output

**Task status management:**
- Each agent persona handles its own status transitions (`in_progress` → `done`)
- You don't manually update task status — the persona does that

## Human Review (agent="user")

When `next_task` returns a task with `agent="user"`:

1. Present context and questions to the user in the conversation
2. Wait for the user's response (no special prefix needed — they respond naturally)
3. Record the user's input in the task results
4. Create follow-up tasks based on the response
5. Mark the human review task as done

**Example: Open Question Resolution (Steps 7, 9, 14)**

When the Critic creates `question` tasks:
```
Questions found:
1. Q1: "How should expired tokens be handled?"
2. Q2: "What is the target latency for API responses?"

[Present questions to user one at a time]
User answers Q1: "Return 401, require re-authentication"
User answers Q2: "p95 under 200ms"

[Record answers, update spec if needed, mark questions as 'done']
```

**Example: Spec Sign-Off (Step 10)**

```
Present the spec summary to the user:
"The specification has been reviewed and all open questions resolved.
 Please review the spec at .maps/docs/[epic-slug]/specification/spec.md

 Do you approve this specification and want to proceed to implementation?"

User: "Yes, approved"

[Commit the spec to git]:
git add .maps/docs/[epic-slug]/specification/spec.md
git commit -m "Approve specification for [epic name]

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

[Mark sign-off task as done, create catalog task]
```

## Critical Review Loops

Critical reviews (steps 5, 8, 13) have a **3-iteration hard limit**:

**Loop structure:**
1. Critic reviews → creates `question` tasks
2. User resolves questions
3. Repeat if Critic finds NEW questions
4. After 3 iterations: pause, surface to user

**Termination conditions:**
- Critic finds zero new questions AND
- User signs off

If the limit is reached:
```
"Critical review has reached the 3-iteration limit and there are still
 [N] unresolved questions. Human intervention needed."

[Present questions to user, get decisions]
```

## Test/Fix Loop

Test failures (steps 17, 19) have a **5-iteration hard limit**:

**Loop structure:**
1. Test Writer runs tests
2. If failures: Critic triages
3. Based on triage:
   - Code wrong → Reviser updates plan → undo code → Developer rebuilds → re-test
   - Test wrong → Test Writer revises test → re-test
   - Both wrong → fix code first, then fix test → re-test
4. Repeat until tests pass or limit reached

**Code undo before rebuild:**
```bash
# Revert modified files
git checkout [modified files]

# Delete new files
rm [new files]
```

**Triage routing:**

Read the Critic's triage review artifact to determine routing:

```markdown
Critic's determination: CODE WRONG
→ Route to: Reviser (create plan revision task)

Critic's determination: TEST WRONG
→ Route to: Test Writer (create test revision task)

Critic's determination: BOTH WRONG
→ Route to: Reviser first, then Test Writer
```

**Hard limit reached:**
```
"Test/fix loop has reached the 5-iteration limit and [N] tests are still failing.
 Human intervention needed."

[Present failure summary, get user guidance]
```

## Creating Follow-Up Tasks

As the workflow progresses, create tasks dynamically:

**After Critic Review #1 (Step 5):**
- Critic creates `question` tasks (one per open question)
- Create a human review task (type="human-review", agent="user") to resolve them
- Block the human review task by all question tasks
- Create Critic Review #2 task, blocked by human review

**After Spec Sign-Off (Step 10):**
- Create catalog task (type="catalog", agent="architect")
- Block it by the sign-off task

**After Catalog (Step 11):**
- Parse the catalog artifact
- For each catalog item: create `plan` task (type="plan", agent="developer")
- Add blocker relationships based on catalog's "blocked by" notes
- Create Critic Review #3 task, blocked by all plan tasks

**After Plans Approved (Step 14):**
- For each plan: create `implement` task (type="implement", agent="developer")
- Preserve blocker relationships from plans

**After All Code Built (Step 15):**
- Create unit test task (type="test", agent="test_writer")
- Block it by all implement tasks

## Crash Recovery

On startup, check for orphaned `in_progress` tasks:

```
const orphaned = task_list(status="in_progress");

for (const task of orphaned) {
  // Mark as orphaned (terminal state)
  task_update task_id=task.id status="orphaned"

  // Create replacement task with context
  task_create parent_id=task.parent_id type=task.type name=task.name
    description="[RETRY AFTER CRASH] Original task ${task.id} failed to complete.
                 Examine file system to see what was already done.
                 Original description: ${task.description}"
    agent=task.agent
}
```

## Compression

Before working with documents as context, compress them:

```
const spec = read_file(spec_path);
const compressed = compress(text=spec);
[Use compressed version for working context]
```

This applies to: specifications, implementation plans, research summaries, catalogs.

Do NOT compress: test results, code, triage reviews (these are already dense).

## Loop Iteration Tracking

Track loop iterations by counting completed sibling tasks:

```
const iteration = task_list(
  parent_id=loop_parent_id,
  type=task.type,
  status="done"
).length;

if (iteration >= HARD_LIMIT) {
  surface_to_user();
}
```

## Success Criteria (per task type)

**Research**: Summaries written and registered as artifacts
**Specification**: Follows guidelines, includes acceptance criteria (Critic validates)
**Catalog**: All spec aspects covered, items are discrete (~3 files each)
**Implementation Plan**: Detailed enough to build from without ambiguity (Critic validates)
**Build**: Code compiles, passes linting (Test Writer validates functional correctness)
**Tests**: All acceptance criteria have tests, tests run
**Critical Review**: Finds all gaps in one pass (3-iteration limit)
**Test/Fix**: All tests pass (5-iteration limit)

## Error Handling

MCP tool errors return error categories. Handle them:

**validation_error**: Fix the input and retry (e.g., invalid status transition)
**not_found**: Verify the ID exists (e.g., task not in current epic)
**rule_violation**: Change approach (e.g., circular blocker)
**precondition_error**: Perform required setup first (e.g., set current_epic_id)
**infrastructure_error**: Surface to user (e.g., database locked)

## Important Reminders

1. **Sequential execution**: You work through tasks one at a time within this conversation
2. **Agents own their status**: Don't manually set task status — activate the agent persona and it will update its own status
3. **Documents are shared state**: Agents share context through documents, retrieved via `artifact_list`
4. **Forward-only status**: Never reopen completed tasks — create new tasks instead
5. **Epic scoping**: All task/artifact operations are auto-scoped to current_epic_id
6. **Single pass per task**: Agents don't loop internally — loops are managed by you creating new tasks
7. **Compression on demand**: Compress documents when loading them into context

## Starting the Workflow

When the user provides a problem description:

```
User: "/maps I want to build a stock market investment tracking system"

You:
1. Create epic task
2. Set current_epic_id
3. Initialize project (.maps/ directories)
4. Create initial research tasks
5. Call next_task
6. Activate Researcher persona
7. Begin Step 2 (Codebase Analysis)
```

Now begin the workflow based on the user's problem statement.
