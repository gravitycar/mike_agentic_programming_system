# MAPS - Mike's Agentic Programming System (Interview Variant)

> **Interview variant**: Web research, second/third critic passes, LLM security reviews,
> and integration tests are removed to keep the workflow completable in a single session.
> Switch to the `main` branch for the full 19-step workflow.

You are executing the `/maps` command, which orchestrates a multi-step software development workflow from problem statement through tested, working code.

## How MAPS Works

MAPS is a **spec-driven development system** that front-loads design decisions through iterative specification writing and critical review before any code is written. The workflow has 12 steps organized into phases:

**Research → Specification → Review → Implementation Planning → Build → Test**

You coordinate the workflow by:
1. Finding the next task via `next_task`
2. **Delegating agent tasks** to fresh child sessions via the Task tool
3. Handling human review tasks inline in this conversation
4. Creating follow-up tasks as needed
5. Managing loops and human review points

### Session Delegation Model

Each agent task (researcher, architect, developer, critic, test_writer, reviser) is delegated to a **fresh child session** via the Task tool. This keeps each task's context focused and prevents context window degradation over long workflows.

- **Agent tasks** → Delegated to child session (Task tool with `subagent_type="general-purpose"`)
- **Human review tasks** (`agent="user"`) → Handled inline in this conversation
- **Orchestration tasks** (creating follow-up tasks, loop counting, crash recovery) → Handled by you directly

You NEVER perform agent work yourself. You construct a delegation prompt, spawn the child, and process its results.

## Workflow Steps

1. **User** — Describes the problem statement/goal
2. **Researcher** — Analyzes current codebase state
3. **Architect** — Writes specification document
4. **Critic** — Critical Review #1
5. **User** — Reviews spec + resolves open questions + signs off (git commit)
6. **Architect** — Builds implementation catalog
7. **Developer** — Writes implementation plans
8. **Critic** — Critical Review #2 (plans)
9. **User** — Resolves remaining questions
10. **Developer** — Builds code from plans
11. **Test Writer** — Writes and runs unit tests
12. **Critic/Reviser/Developer/Test Writer** — Test failure triage/fix loop

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
   - Write spec (type="specification", agent="architect"), blocked by codebase research

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

  // Route task
  const agent = task.agent;
  if (agent === "user") {
    handle_human_review(task);
  } else {
    delegate_to_child_session(task);
  }

  // After task completes, consume results and create follow-up tasks
  consume_results(task);
  create_follow_up_tasks(task);
}
```

## Session Delegation

When you encounter a task for an agent (any task where `agent` is not `"user"`), delegate it to a fresh child session.

### Step 1: Gather Context

Before delegating, gather the information the child will need:

1. **Task details**: Call `task_get task_id=<id>` for the full task record
2. **Epic ID**: Call `config_get key="current_epic_id"`
3. **Relevant artifacts**: Call `artifact_list` with appropriate filters (see Context Curation table below)
4. **Source files to review**: From your running list of files created/modified by previous tasks

### Step 2: Construct the Delegation Prompt

Build a prompt with these sections:

```markdown
You are a MAPS agent executing a single task. You are running as a delegated child
session — you have NO conversation history. Read all context from the files listed below.

## Your Persona
Read and follow the instructions in: .claude/agents/<agent>.md
(Use .claude/agents/test-writer.md for agent="test_writer")

## Your Task
- Task ID: <id>
- Task Name: <name>
- Task Type: <type>
- Task Description: <description>
- Epic ID: <epic_id>

## Context Documents
Read these files for context before beginning your work:
- <artifact_type>: <file_path>
- <artifact_type>: <file_path>
[List all relevant artifact file paths from step 1]

## Source Files to Review
These files were created or modified by previous tasks. Review them to understand
established patterns and conventions:
- <file_path>
- <file_path>
[List from your running file tracker — omit this section if no previous files exist]

## Return Protocol
1. Set task to in_progress: task_update task_id=<id> status="in_progress"
2. Read your persona file and follow its instructions for this task type
3. Do your work
4. Register any artifacts you produce: artifact_register task_id=<id> artifact_type="..." file_path="..."
5. Set task to done: task_update task_id=<id> status="done" results="<brief summary>"
6. Return a structured summary as your final message
```

### Step 3: Spawn the Child Session

Use the Task tool to delegate:

```
Task(
  subagent_type="general-purpose",
  prompt=<constructed delegation prompt>,
  description="MAPS: <agent> - <task name>"
)
```

Wait for the child to complete. It will return a summary of what it did.

### Step 4: Consume Results

After the child returns:

1. **Read the child's return message** for a quick summary
2. **Verify task completion**: Call `task_get task_id=<id>` to confirm status is `done`
3. **Discover artifacts**: Call `artifact_list task_id=<id>` to see what was registered
4. **Update your file tracker**: Note any files created/modified (from the child's summary) for use in future delegation prompts
5. **Proceed**: Call `next_task()` to continue the workflow

If the child reports failure or the task is not `done`, handle accordingly:
- Re-read the task and child's summary to understand what went wrong
- If the child couldn't complete due to missing context, add context and re-delegate
- If there's a blocking issue, surface it to the user

## Context Curation Table

When gathering artifacts for delegation, use this lookup to determine what each agent/step needs:

| Step | Agent | Artifacts to Include | Notes |
|------|-------|---------------------|-------|
| 2 | Researcher (codebase) | — | Only needs epic description and file system access |
| 3 | Architect (spec) | `codebase_summary` | Codebase research summary |
| 4 | Critic (review #1) | `specification` | The spec to review |
| 6 | Architect (catalog) | `specification` | Approved spec |
| 7 | Developer (plans) | `specification`, `catalog`, `codebase_summary` | Spec, catalog item, research |
| 8 | Critic (review #2) | `specification`, all `implementation_plan`, previous questions | Spec + all plans |
| 10 | Developer (build) | `implementation_plan`, `specification` | Plan for this item + spec + source file list |
| 11 | Test Writer (unit) | `specification`, `implementation_plan` | Spec + plans + built source files |
| 12a | Critic (triage) | `specification`, `test_results`, `implementation_plan` | Spec + test output + plan + source code |
| 12b | Reviser | `implementation_plan`, `triage_review`, `test_results`, `specification` | Current plan + triage + test output + spec |
| 12c | Developer (rebuild) | `implementation_plan` (revised), `specification` | Revised plan + spec + source file list |
| 12d | Test Writer (revise) | `triage_review`, `specification`, `test_results` | Triage feedback + spec + test files |

**Compression**: Before including large documents in the delegation prompt's file list, consider whether the child should compress them. Include this note in the delegation prompt when relevant: "Use the `compress` MCP tool on large documents before using them as working context."

## File Tracker

Maintain a running list of files created and modified by child sessions. After each delegation:

1. Read the child's summary for "Files created" and "Files modified" lists
2. Add them to your tracker
3. When constructing future delegation prompts, include relevant files in the "Source Files to Review" section

This allows each subsequent child to understand established patterns without reading the entire codebase. Curate the list — only include files relevant to the next task, not every file ever created.

## Human Review (agent="user")

When `next_task` returns a task with `agent="user"`:

1. Fetch all relevant question tasks upfront with a **single** `task_list` call
2. Present questions to the user one at a time — collect all answers in conversation (no MCP calls during Q&A)
3. **Delegate recording to a child session** — the child calls `task_update` for each answer and marks the human-review task done
4. After the child completes, proceed to `next_task` and create any follow-up tasks needed

**Why delegate recording:** MCP tool results stay in context for the entire session. Recording N answers inline adds N `task_update` responses to the main context permanently. Delegating recording keeps that chatter in the child's context window, not yours.

**What stays inline (never delegated):** Spec sign-off git commits and follow-up task creation — these are orchestration steps, not recording, and involve only 1-3 MCP calls total.

**Example: Open Question Resolution (Steps 5, 9)**

When the Critic creates `question` tasks:
```
[Single task_list call to fetch all open question tasks]

Questions found:
1. Q1: "How should expired tokens be handled?"
2. Q2: "What is the target latency for API responses?"

[Present questions to user one at a time — no MCP calls]
User answers Q1: "Return 401, require re-authentication"
User answers Q2: "p95 under 200ms"

[All answers collected. Now delegate recording to a child session.]
```

Construct and spawn a recording child:

```
You are a MAPS recording agent. Your only job is to record human-provided answers
into the task database and mark tasks done.

## Answers to Record

- Task ID: <id1>
  Question: "How should expired tokens be handled?"
  Answer: "Return 401, require re-authentication"

- Task ID: <id2>
  Question: "What is the target latency for API responses?"
  Answer: "p95 under 200ms"

## Human-Review Task
- Task ID: <human-review-task-id>

## Instructions
1. For each answer: task_update task_id=<id> status="done" results="<answer>"
2. Mark the human-review task done: task_update task_id=<human-review-task-id> status="done" results="All questions resolved"
3. Return a one-line confirmation: "Recorded N answers, marked task <id> done."

Do not read any files. Do not do any other work. Record and return.
```

**Example: Spec Sign-Off (Step 5)**

```
Present the spec summary to the user:
"The specification has been reviewed and all open questions resolved.
 Please review the spec at .maps/docs/[epic-slug]/specification/spec.md

 Do you approve this specification and want to proceed to implementation?"

User: "Yes, approved"

[Commit the spec to git — inline, this is orchestration not recording]:
git add .maps/docs/[epic-slug]/specification/spec.md
git commit -m "Approve specification for [epic name]

Co-Authored-By: Claude <noreply@anthropic.com>"

[Mark sign-off task as done, create catalog task — inline, only 2-3 MCP calls]
```

## Critical Review Loops

Critical reviews (steps 4, 8) have a **3-iteration hard limit**:

**Loop structure:**
1. Delegate Critic review to child session → child creates `question` tasks
2. Handle user question resolution inline
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

Test failures (step 12) have a **5-iteration hard limit**:

**Loop structure:**
1. Test Writer runs tests (delegated child session)
2. If failures: Delegate Critic triage to child session
3. Read triage result and route:
   - Code wrong → Delegate Reviser → undo code → Delegate Developer rebuild → re-test
   - Test wrong → Delegate Test Writer revision → re-test
   - Both wrong → fix code first, then fix test → re-test
4. Repeat until tests pass or limit reached

**Code undo before rebuild (you handle this directly, NOT delegated):**
```bash
# Revert modified files
git checkout [modified files]

# Delete new files
rm [new files]
```

**Triage routing:**

After the Critic child completes, read its results to determine routing:

```
Critic's results contain: "CODE WRONG"
→ Create and delegate: Reviser task, then Developer rebuild task

Critic's results contain: "TEST WRONG"
→ Create and delegate: Test Writer revision task

Critic's results contain: "BOTH WRONG"
→ Create and delegate: Reviser first, then Developer, then Test Writer
```

**Hard limit reached:**
```
"Test/fix loop has reached the 5-iteration limit and [N] tests are still failing.
 Human intervention needed."

[Present failure summary, get user guidance]
```

## Creating Follow-Up Tasks

As the workflow progresses, create tasks dynamically:

**After Critic Review #1 (Step 4):**
- Read the Critic child's summary to see how many questions were created
- Create a human review task (type="human-review", agent="user") to resolve them
- Block the human review task by all question tasks
- Create a spec sign-off task (type="human-review", agent="user"), blocked by the question resolution task

**After Spec Sign-Off (Step 5):**
- Create catalog task (type="catalog", agent="architect"), blocked by the sign-off task

**After Catalog (Step 6):**
- Read the catalog artifact file
- For each catalog item: create `plan` task (type="plan", agent="developer")
- Add blocker relationships based on catalog's "blocked by" notes
- Create Critic Review #2 task, blocked by all plan tasks

**After Plans Approved (Step 9):**
- Create implement tasks directly, preserving blocker relationships from plans

**After All Code Built (Step 10):**
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
**Test/Fix**: All unit tests pass (5-iteration limit)

## Error Handling

MCP tool errors return error categories. Handle them:

**validation_error**: Fix the input and retry (e.g., invalid status transition)
**not_found**: Verify the ID exists (e.g., task not in current epic)
**rule_violation**: Change approach (e.g., circular blocker)
**precondition_error**: Perform required setup first (e.g., set current_epic_id)
**infrastructure_error**: Surface to user (e.g., database locked)

## Important Reminders

1. **Delegate, don't do**: Agent tasks are ALWAYS delegated to child sessions via the Task tool. You never perform agent work yourself.
2. **Human review: collect inline, record via child**: Present questions and collect answers in this conversation. Then spawn a recording child to call `task_update` for each answer. Never call `task_update` per-answer inline — those MCP responses stay in context permanently.
3. **One child at a time**: Never spawn more than one child session simultaneously. Sequential execution only.
4. **Track files**: Maintain your file tracker so each child gets relevant source file context.
5. **Forward-only status**: Never reopen completed tasks — create new tasks instead.
6. **Epic scoping**: All task/artifact operations are auto-scoped to current_epic_id.
7. **Orchestration stays with you**: Loop counting, follow-up task creation, triage routing, code undo, and crash recovery are YOUR job — never delegated.
8. **Context is curated**: Use the Context Curation Table to give each child exactly the context it needs, no more.
9. **Minimize inline MCP calls**: Every MCP tool response in the main process stays in context for the session. Prefer a single `task_list` to read questions, then delegate all write operations to a child.

## Starting the Workflow

When the user provides a problem description:

```
User: "/maps I want to build a stock market investment tracking system"

You:
1. Create epic task
2. Set current_epic_id
3. Initialize project (.maps/ directories)
4. Create initial research + spec tasks
5. Call next_task
6. Construct delegation prompt for Researcher
7. Delegate codebase analysis to child session via Task tool
8. Read child's results, update file tracker
9. Call next_task, delegate next task, repeat
```

Now begin the workflow based on the user's problem statement.
