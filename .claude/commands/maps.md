# MAPS - Mike's Agentic Programming System

You are executing the `/maps` command, which orchestrates a multi-step software development workflow from problem statement through tested, working code.

## How MAPS Works

MAPS is a **spec-driven development system** that front-loads design decisions through iterative specification writing and critical review before any code is written. The workflow has 19 steps organized into phases:

**Research → Specification → Review → Implementation Planning → Build → Test**

You coordinate the workflow by:
1. Finding the next task via `next_task`
2. **Delegating agent tasks** to fresh child sessions via the Task tool
3. Handling human review tasks inline in this conversation
4. Creating follow-up tasks as needed
5. Managing loops and human review points

### Session Delegation Model

Each agent task (researcher, architect, developer, critic, test_writer, reviser, llm_security_auditor) is delegated to a **fresh child session** via the Task tool. This keeps each task's context focused and prevents context window degradation over long workflows.

- **Agent tasks** → Delegated to child session (Task tool with `subagent_type="general-purpose"`)
- **Human review tasks** (`agent="user"`) → Handled inline in this conversation
- **Orchestration tasks** (creating follow-up tasks, loop counting, crash recovery) → Handled by you directly

You NEVER perform agent work yourself. You construct a delegation prompt, spawn the child, and process its results.

## Workflow Steps (from 07-workflow.md)

1. **User** — Describes the problem statement/goal
2. **Researcher** — Analyzes current codebase state
3. **Researcher** — Searches web for domain articles
4. **Architect** — Writes specification document
5. **Critic** — Critical Review #1
6-7. **User** — Reviews spec + resolves open questions
8. **Critic** — Critical Review #2
9-10. **User** — Addresses questions + signs off (git commit)
10a. **LLM Security Auditor** — LLM Security Review of Specification (skips if no LLM integration)
10b. **User** — Resolves security questions (skips if 10a found no issues)
10c. **LLM Security Auditor** — LLM Security Review iteration #2 (only if 10b produced changes; 2-iteration hard limit)
10d. **User** — Resolves remaining security questions (skips if 10c found no issues)
11. **Architect** — Builds implementation catalog
12. **Developer** — Writes implementation plans
13. **Critic** — Critical Review #3
14. **User** — Resolves remaining questions
14a. **LLM Security Auditor** — LLM Security Review of Implementation Plans (skips if no LLM integration)
14b. **User** — Resolves security questions on plans (skips if 14a found no issues)
14c. **LLM Security Auditor** — LLM Security Review of Plans iteration #2 (only if 14b produced changes; 2-iteration hard limit)
14d. **User** — Resolves remaining security questions on plans (skips if 14c found no issues)
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
(Use .claude/agents/llm-security-auditor.md for agent="llm_security_auditor")

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
| 3 | Researcher (web) | `codebase_summary` | Codebase summary guides web research |
| 4 | Architect (spec) | `codebase_summary`, `web_research` | Both research summaries |
| 5 | Critic (review #1) | `specification` | The spec to review |
| 8 | Critic (review #2) | `specification`, previous `review_summary` | Revised spec + prior questions |
| 10a | LLM Security Auditor (spec) | `specification`, resolved questions | Approved spec + codebase access for security audit |
| 10c | LLM Security Auditor (spec #2) | `specification`, `security_review`, resolved questions | Spec + prior security review + user responses |
| 11 | Architect (catalog) | `specification` | Approved spec |
| 12 | Developer (plans) | `specification`, `catalog`, `codebase_summary` | Spec, catalog item, research |
| 13 | Critic (review #3) | `specification`, all `implementation_plan`, previous questions | Spec + all plans |
| 14a | LLM Security Auditor (plans) | `specification`, all `implementation_plan`, `security_review` (spec-level), resolved questions | Spec + all plans + prior security review |
| 14c | LLM Security Auditor (plans #2) | `specification`, all `implementation_plan`, `security_review` (both), resolved questions | Spec + plans + both security reviews + user responses |
| 15 | Developer (build) | `implementation_plan`, `specification` | Plan for this item + spec + source file list |
| 16 | Test Writer (unit) | `specification`, `implementation_plan` | Spec + plans + built source files |
| 17a | Critic (triage) | `specification`, `test_results`, `implementation_plan` | Spec + test output + plan + source code |
| 17b | Reviser | `implementation_plan`, `triage_review`, `test_results`, `specification` | Current plan + triage + test output + spec |
| 17c | Developer (rebuild) | `implementation_plan` (revised), `specification` | Revised plan + spec + source file list |
| 17d | Test Writer (revise) | `triage_review`, `specification`, `test_results` | Triage feedback + spec + test files |
| 18 | Test Writer (integration) | `specification`, `implementation_plan` | Same as step 16 but for integration tests |
| 19a-d | (same as 17a-d) | (same as 17a-d) | Integration test triage/fix loop |

**Compression**: Before including large documents in the delegation prompt's file list, consider whether the child should compress them. Include this note in the delegation prompt when relevant: "Use the `compress` MCP tool on large documents before using them as working context."

## File Tracker

Maintain a running list of files created and modified by child sessions. After each delegation:

1. Read the child's summary for "Files created" and "Files modified" lists
2. Add them to your tracker
3. When constructing future delegation prompts, include relevant files in the "Source Files to Review" section

This allows each subsequent child to understand established patterns without reading the entire codebase. Curate the list — only include files relevant to the next task, not every file ever created.

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

Co-Authored-By: Claude <noreply@anthropic.com>"

[Mark sign-off task as done, create catalog task]
```

## Critical Review Loops

Critical reviews (steps 5, 8, 13) have a **3-iteration hard limit**:

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

## LLM Security Review Loop

LLM security reviews (steps 10a-10d and 14a-14d) have a **2-iteration hard limit** and are **conditional** — they only run if the epic involves LLM integration.

**Loop structure (spec review — steps 10a-10d):**
1. After user signs off on spec (step 10), create LLM Security Auditor task (type="security_review", agent="llm_security_auditor")
2. Delegate to child session → child determines applicability
3. **If no LLM integration**: child marks task done with "not applicable", skip to step 11
4. **If LLM integration detected**: child audits codebase, reviews spec, creates `question` tasks
5. **If child recommends DEFER**: present deferral recommendation to user as a question. User decides whether to accept.
6. Handle user question resolution inline (steps 10b)
7. If questions were resolved AND changes made to spec: create second security review task, delegate (step 10c, iteration #2)
8. Handle any new questions (step 10d)
9. After 2 iterations OR zero new questions: proceed to step 11

**Loop structure (plans review — steps 14a-14d):**
Same pattern as above, but reviewing implementation plans after the Critic's review #3 and user question resolution (step 14).

**Creating the initial security review task (after step 10 sign-off):**
```
task_create parent_id=<epic-id> type="security_review" name="LLM Security Review: Specification" description="Review the approved specification for LLM-specific security vulnerabilities. Follow docs/guidelines/LLM_SECURITY_GUIDELINES.md." agent="llm_security_auditor"
```

**Creating the plans security review task (after step 14):**
```
task_create parent_id=<epic-id> type="security_review" name="LLM Security Review: Implementation Plans" description="Review implementation plans for LLM-specific security vulnerabilities. Follow docs/guidelines/LLM_SECURITY_GUIDELINES.md." agent="llm_security_auditor"
```

**Handling the "DEFER EPIC" recommendation:**
If the security auditor recommends deferring the epic, present this to the user:
```
"The LLM Security Auditor recommends deferring this epic because the codebase has no
 LLM security infrastructure in place. The auditor recommends implementing foundational
 LLM security measures in a separate epic first.

 Details: [auditor's explanation]

 Do you want to:
 1. Accept the deferral and create a foundational LLM security epic
 2. Override and proceed anyway (accepting the security risk)
 3. Discuss further"
```
The user's decision is final. If they choose to proceed, continue the workflow normally.

**Skipping cleanly:**
If the security auditor determines the epic has no LLM integration, it marks its task done with results indicating "not applicable." The orchestrator reads this result, skips any follow-up question resolution steps, and proceeds directly to the next workflow step. No question tasks are created, no user interaction needed.

## Test/Fix Loop

Test failures (steps 17, 19) have a **5-iteration hard limit**:

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

**After Critic Review #1 (Step 5):**
- Read the Critic child's summary to see how many questions were created
- Create a human review task (type="human-review", agent="user") to resolve them
- Block the human review task by all question tasks
- Create Critic Review #2 task, blocked by human review

**After Spec Sign-Off (Step 10):**
- Create LLM security review task (type="security_review", agent="llm_security_auditor")
- Block it by the sign-off task
- Create catalog task (type="catalog", agent="architect")
- Block catalog task by the security review task (so it waits for security review + any follow-up questions to complete)

**After Catalog (Step 11):**
- Read the catalog artifact file
- For each catalog item: create `plan` task (type="plan", agent="developer")
- Add blocker relationships based on catalog's "blocked by" notes
- Create Critic Review #3 task, blocked by all plan tasks

**After Plans Approved (Step 14):**
- Create LLM security review task for plans (type="security_review", agent="llm_security_auditor")
- Block it by all plan question resolution tasks
- After security review completes (and any follow-up questions resolved):
- For each plan: create `implement` task (type="implement", agent="developer")
- Preserve blocker relationships from plans
- Block all implement tasks by the plans security review task (so implementation waits for security review)

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
**LLM Security Review**: Identifies all LLM security concerns in one pass, or determines "not applicable" (2-iteration limit)
**Test/Fix**: All tests pass (5-iteration limit)

## Error Handling

MCP tool errors return error categories. Handle them:

**validation_error**: Fix the input and retry (e.g., invalid status transition)
**not_found**: Verify the ID exists (e.g., task not in current epic)
**rule_violation**: Change approach (e.g., circular blocker)
**precondition_error**: Perform required setup first (e.g., set current_epic_id)
**infrastructure_error**: Surface to user (e.g., database locked)

## Important Reminders

1. **Delegate, don't do**: Agent tasks are ALWAYS delegated to child sessions via the Task tool. You never perform agent work yourself.
2. **Human review is inline**: Tasks with `agent="user"` are handled directly in this conversation.
3. **One child at a time**: Never spawn more than one child session simultaneously. Sequential execution only.
4. **Track files**: Maintain your file tracker so each child gets relevant source file context.
5. **Forward-only status**: Never reopen completed tasks — create new tasks instead.
6. **Epic scoping**: All task/artifact operations are auto-scoped to current_epic_id.
7. **Orchestration stays with you**: Loop counting, follow-up task creation, triage routing, code undo, and crash recovery are YOUR job — never delegated.
8. **Context is curated**: Use the Context Curation Table to give each child exactly the context it needs, no more.

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
6. Construct delegation prompt for Researcher
7. Delegate codebase analysis to child session via Task tool
8. Read child's results, update file tracker
9. Call next_task, delegate next task, repeat
```

Now begin the workflow based on the user's problem statement.
