# MAPS - Mike's Agentic Programming System

You are executing the `/maps` command, which orchestrates a multi-step software development workflow from problem statement through tested, working code.

## How MAPS Works

MAPS is a **spec-driven development system** that front-loads design decisions through iterative specification writing and critical review before any code is written. The workflow has 20 steps organized into phases:

**Research → Specification → Review → Implementation Planning → Build → Test**

You coordinate the workflow by:
1. Finding the next task via `next_task`
2. **Delegating agent tasks** to fresh child sessions via the Task tool
3. Handling human review tasks inline in this conversation
4. Creating follow-up tasks as needed
5. Managing loops and human review points

### Session Delegation Model

Each agent task (researcher, architect, developer, critic, test_writer, reviser, llm_security_auditor) is delegated to a **fresh child session** via the Task tool. This keeps each task's context focused and prevents context window degradation over long workflows.

- **Agent tasks** → Delegated to child session (Task tool with `subagent_type="general-purpose"`). At build time, a child may be resumed with `SendMessage` to answer its question or to act on review findings
- **Human review tasks** (`agent="user"`) → Handled inline in this conversation
- **Orchestration tasks** (creating follow-up tasks, loop counting, crash recovery) → Handled by you directly

Every delegation also carries a **model**. You pass it on the Task call. See [Model Routing](#model-routing).

You NEVER perform agent work yourself. You construct a delegation prompt, spawn the child, and process its results.

## Workflow Steps (from 07-workflow.md)

0. **Intake** — A Researcher scope probe, then the user picks Direct, Full, or Nothing (see [Step 0: Intake](#step-0-intake)). Steps 1 to 20 below are the Full path.
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
11a. **Critic** — Catalog Review (single pass, no iteration loop)
11b. **User** — Reviews and approves the catalog
12. **Developer** — Writes implementation plans
13. **Critic** — Critical Review #3
14. **User** — Resolves remaining questions
14a. **LLM Security Auditor** — LLM Security Review of Implementation Plans (skips if no LLM integration)
14b. **User** — Resolves security questions on plans (skips if 14a found no issues)
14c. **LLM Security Auditor** — LLM Security Review of Plans iteration #2 (only if 14b produced changes; 2-iteration hard limit)
14d. **User** — Resolves remaining security questions on plans (skips if 14c found no issues)
15-17r. **Per-item build loop**, one catalog item at a time, on the `maps/<epic-slug>` work branch (see [Per-Item Build Loop](#per-item-build-loop-steps-15-to-17r)):
  15. **Developer** — Builds this item from its plan
  15a. **Critic** — Plan/code reconciliation for this item
  16. **Test Writer** — Writes and runs this item's unit tests
  17. **Critic/Reviser/Developer/Test Writer** — Test failure triage/fix loop, then a checkpoint commit
  17r. **Critic/Developer** — Code review loop, up to 3 rounds
18. **Test Writer** — Writes and runs integration tests
19. **Critic/Reviser/Developer/Test Writer** — Integration test triage/fix loop
20. **Acceptance Verification** — materialize Acceptance Test and Acceptance Criterion tasks, verify every criterion, then complete the Epic:
20a. **Test Writer/Verifier** — Run MAPS-owned Acceptance Tests (Test Writer runs executable ones; Verifier interprets judgment ones)
20b. **Critic/Reviser/Developer/Test Writer** — Acceptance Test failure triage/fix loop (adds "criterion/spec wrong" verdict → escalate to user)
20c. **Verifier** — Confirm each Acceptance Criterion (evidence + confidence); mark AC done
20d. **User/Verifier** — User-owned Acceptance Tests (slim list + next-test detail); Verifier confirms. Epic completes when every AC is done

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

4a. **Detect the code review skill.** Search the available skills for `code-reviewer-metarouter`. If it is listed, find its `scripts/review_diff.py` (in the skill's directory) and run `python3 <that path> --help`. The skill is usable only when the help text lists `--base` (MetaRouter plugin 0.22.0 or later) and `python3` runs. Record the result: `config_set key="code_review_skill" value="available"` or `value="unavailable"`. When it is usable, also record the skill directory: `config_set key="code_review_skill_dir" value="<absolute path>"`.

4b. **Run Step 0, Intake** (see [Step 0: Intake](#step-0-intake)). Continue with steps 5 and 6 below only when the user picks Full.

5. **Ask about LLM security review**:

   Ask the user:
   ```
   "Does this project involve LLM integration — calling an LLM API, building an
    AI feature, processing LLM-generated content, etc.?

    If yes (or you're unsure), the LLM Security Auditor will review your spec
    and implementation plans.
    If no, security review will be skipped entirely."
   ```
   Store the answer immediately:
   - User says yes / unsure: `config_set key="llm_security_review" value="enabled"`
   - User says no: `config_set key="llm_security_review" value="disabled"`

6. **Create initial task chain** under the epic:
   - Research codebase (type="research", agent="researcher"). Its delegation includes the `scope_probe` from Step 0 as a starting point.
   - Research web (type="research", agent="researcher")
   - Block "Research web" by "Research codebase"
   - Write spec (type="specification", agent="architect")
   - Block "Write spec" by both research tasks

## Step 0: Intake

Intake runs only when a **new** epic starts, never when the user resumes one. It decides how much process the change needs. The spec is `docs/specs/11-intake.md`.

1. **Scope probe.** `task_create parent_id=<epic-id> type="research" name="Scope probe" agent="researcher"`. Delegate it on `sonnet` with `mode: document`, the doc path and `artifact_type` `scope_probe` from the Output Paths table, and this brief in the task description:

   > Take a quick look, not a codebase study. Write about one page with five sections. **Touch list:** the files and locations the change reaches, grouped where the change repeats. **Approaches:** the reasonable ways to make the change, one line each. **Checks:** the existing commands that prove the change works (build, unit tests, lint, type check), discovered from the repo. **Risk signals:** each signal below that applies, with one line of evidence. **Recommended outcome:** Direct, Full, or Nothing, with a one-sentence reason. For a dependency change, read the changelog or release notes between the current and target versions; use web search only for that. Risk signals, any of which rules out Direct: more than one reasonable approach; new behavior that new tests must prove (updating expected values in existing tests does not count); a schema or data migration; a change to an API contract other code or teams use; authentication, secrets, or credentials; LLM integration; a breaking change in a dependency's changelog. Recommend Direct only for a mechanical change with one obvious approach that existing checks can prove. File count is not a signal. Recommend Nothing when the change is already done, something already covers it, or it is not worth its cost.

2. **Recommend.** Read the probe. Ask the user with AskUserQuestion: the probe's recommended outcome first, with its one-sentence reason, then the other outcomes. Offer **Direct**, **Full**, and **Nothing**. (`/maps-lite` is not built, so Lite is not offered.)
3. **Record.** `config_set key="intake_outcome" value="direct|full|nothing"`.
4. **Route.**
   - **Full:** continue Initial Setup at step 5.
   - **Direct:** run [The Direct Path](#the-direct-path).
   - **Nothing:** tell the user why, in the probe's words. Mark the epic `in_progress`, then `done`, with results `Intake: nothing to build. <reason>`. (A `deferred` epic would still be offered for resume by `epic_list`.) Stop.

## The Direct Path

A mechanical change with no spec, catalog, or plan. It uses the same work branch, checkpoint commits, code review loop, and Question Ladder as the Full path, applied to one item.

**Tasks.** Create, under the epic:
- `Direct change` — type `implement`, agent `developer`.
- `User review: direct` — type `human-review`, agent `user`, blocked by `Direct change`.

`User review: direct` is this path's **hold target** (see The item hold in Per-Item Build Loop). Create every other Direct task when it is needed, and add each one as a blocker of `User review: direct` before you call `next_task` again. That includes the review rounds, ladder questions, and fix tasks.

**Steps.**
1. **Work branch.** Create the work branch (see [Item Commits and the Work Branch](#item-commits-and-the-work-branch)). Record the branch `HEAD` as the item base: `config_set key="item_base:<epic-id>:direct" value="<sha>"`.
2. **Build.** Delegate the Developer on `sonnet`. Context: the problem statement and the `scope_probe`. Tell it: there is no plan; make the change across the probe's touch list; run every check in the probe's Checks section; on a failing check, read the failure and fix it, **at most 2 times**. Tell it to return `ESCALATE: <reason>` in place of a normal result when the change stops being mechanical: a breaking API change, a check failure that needs a design choice, or a second reasonable approach.
3. **Escalate from the build.** On `ESCALATE`, run Escalation (below).
4. **Commit.** When every check passes, make a checkpoint commit.
5. **Code review loop.** Create `Code review round 1: direct` (type `agent-review`, agent `critic`), hold it, and run [the Code Review Loop](#code-review-loop-step-17r) with three Direct additions in the Critic's brief:
   - Also check that the change is complete across the probe's touch list, that nothing outside the touch list changed, and that no risk signal appeared during the build.
   - Return the verdict `ESCALATE: <risk signal>` in place of findings when a risk signal has appeared.
   - A check that fails after a review fix counts against the same **2-iteration** fix limit as the build, not the 5-iteration limit of a full item.
6. **Questions.** Build-time children use the Question Ladder. The Architect answers against the problem statement and the probe, since there is no spec. A question that needs a real design choice is a risk signal, so the Architect returns `RECOMMEND ESCALATION` with the reason in place of a decision. Present that to the user as an escalation.
7. **User review.** Show the diff summary (`git diff --stat <item base>..HEAD`), the checks run, each round's verdict from the review log, the declined findings, and any [decisions made for the user](#decided-for-you). The user approves, asks for changes, or escalates. A requested change goes back to the resumed Developer, then through the checks, a commit, and a new review round.
8. **Done.** The change is committed on the work branch. Never push or merge. Tell the user the branch name, so they can merge it or open an MR. Let the recording child mark `User review: direct` done. Then mark the epic `in_progress`, then `done` (`open` cannot go straight to `done`).

There is no Step 20. The problem statement and the probe's Checks are the acceptance test.

**Escalation.** The user decides between Full and staying on the Direct path. If the user picks Full:
1. Save the attempt first, including uncommitted changes: `git diff <item base> > .maps/docs/<epic-slug>/research/direct-attempt.diff`. Register it as `direct_attempt` on the `Direct change` task.
2. Undo any uncommitted change with the code-undo procedure (see Test/Fix Loop).
3. Check out the branch the user started on, and rename the work branch: `git branch -m maps/<epic-slug> maps/<epic-slug>-direct`. Keep it. Never delete it.
4. Set every Direct task that is not `done` to `deferred` (an `in_progress` one too). Never reopen a task.
5. `config_set key="intake_outcome" value="full"`, then continue Initial Setup at step 5. The codebase research task also gets the `direct_attempt` diff.

## Main Loop

After setup, enter the main workflow loop:

```
while (true) {
  // Find next work
  const task = next_task();

  if (!task) {
    // No open tasks — check if epic is complete
    const epicTasks = task_list(parent_id=epic_id);
    if (every task is 'done', 'deferred', or 'orphaned') {
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
5. **Prior work in this epic**: For a Developer or Test Writer delegation, pull the relevant entries from your File Tracker and Build Summaries (see below)
6. **Model**: Read the `Model` column for this step in the Context Curation table below

### Step 2: Construct the Delegation Prompt

Build a prompt with these sections:

```markdown
You are a MAPS agent executing a single task. You are running as a delegated child
session — you have NO conversation history. Read all context from the files listed below.

## Your Persona
Read and follow the instructions in: .claude/agents/<agent>.md
(Use .claude/agents/test-writer.md for agent="test_writer")
(Use .claude/agents/llm-security-auditor.md for agent="llm_security_auditor")
(Use .claude/agents/verifier.md for agent="verifier")

## Delegation Contract
(Include this block for document-producing tasks — research, spec, catalog, plan. Fill `doc path` and `artifact_type` from the Output Paths table below. `/maps` always uses `document` mode. Omit this block for tasks that author no document — e.g. building code, running tests.)
- mode: document
- doc path: <the file this task writes — from the Output Paths table>
- artifact_type: <type to register — from the Output Paths table>

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

## Prior Work in This Epic — Developer
(For a Developer delegation at steps 15/17c, or a Test Writer delegation at steps
16/18/20a. Pass every entry from the File Tracker and Build Summaries verbatim, in
full, unfiltered. Omit this section if no prior Developer entry exists yet.)
- <catalog item name> — Built: <bullet>; <bullet>; ... — Files: <path>, <path>

## Prior Work in This Epic — Test Writer
(Test Writer delegation only, steps 16/18/20a. Same rule: every entry, verbatim, in
full. Omit this section if no prior Test Writer entry exists yet.)
- <catalog item name> — Built: <bullet>; <bullet>; ... — Files: <path>, <path>

## Build-Time Rules
(Build-time tasks only: Steps 15 to 20, the Step 17r code review loop, and the Direct
path. Omit for every task in Steps 0 to 14. Include the "Critic" block only for a
Critic task.)
- Settled answers: read the answer log at <answer_log path> before you start. Its
  entries are settled. Do not ask them again. (Omit the line if the log does not exist yet.)
- Questions: if you need an answer you cannot find in the code, the context documents,
  or the answer log, follow "Asking a question" in the Return Protocol. Do not guess at
  a blocking question and do not stop without asking.
- Critic: answer from the code first. Read the changed code, its callers, and its tests,
  and run a focused test where useful, before you raise a question.
- Critic: back every claim with a `file:line`. Phrase a finding you could not trace as a
  question that names what you could not check.
- Critic: respect settled ground. The approved spec, the answer log, and findings the
  Developer declined are settled unless the code changes the reason.
- Critic: in a code review round after round 1, report Important findings only. An
  Important finding names a concrete consequence. Anything else is a Nit, at most two
  per review.

## Return Protocol
1. Set task to in_progress: task_update task_id=<id> status="in_progress"
2. Read your persona file and follow its instructions for this task type
3. Do your work
4. Register any artifacts you produce: artifact_register task_id=<id> artifact_type="..." file_path="..."
5. Set task to done: task_update task_id=<id> status="done" results="<brief summary>"
6. Return a structured summary as your final message

Asking a question (build-time tasks only):
- Put `STATUS: NEEDS_ANSWER` on the first line of your final message, then one block
  per question:
  ### Q<n>: <the question in one sentence>
  - Checked: <what you read or ran>
  - Blocking: yes | no
  - Proposed default: <the answer you would choose>
  - Kind: code fact | design | user only
- "User only" is for scope, an acceptance criterion, a decision the user recorded, a
  credential, or a cost the user must accept.
- With any blocking question: stop, leave the task `in_progress` (skip step 5), and
  return. The orchestrator resumes you with the answer.
- With only non-blocking questions: finish the work using your proposed defaults, mark
  the task done, and list the questions as assumptions.
```

### Step 3: Spawn the Child Session

Before spawning, write the task id being delegated to `.maps/.active_task`
(plain text, just the integer, overwrite any existing content). This lets the
SubagentStop telemetry hook correlate its token/time record back to this task.
Safe because /maps never has more than one delegation in flight at a time.

Use the Task tool to delegate:

```
Task(
  subagent_type="general-purpose",
  model=<model for this step, from the Context Curation table>,
  prompt=<constructed delegation prompt>,
  description="MAPS: <agent> - <task name>"
)
```

Wait for the child to complete. It will return a summary of what it did.

**Keep the child's agent ID.** Note the ID the Task tool returns for every build-time child (Steps 15 to 20, the Step 17r review loop, and the Direct path). You resume these children later with `SendMessage`, in the Question Ladder and the code review loop. Load `SendMessage` with ToolSearch if it is deferred. Before you resume a child, write its task id to `.maps/.active_task` again, so the telemetry hook files the resumed work under the right task.

### Step 4: Consume Results

After the child returns:

0. **Check for `STATUS: NEEDS_ANSWER`** on the first line of the child's message. If it is there, run the [Question Ladder](#question-ladder) for its questions before anything else.
1. **Read the child's return message** for a quick summary
2. **Verify task completion**: Call `task_get task_id=<id>` to confirm status is `done`
3. **Discover artifacts**: Call `artifact_list task_id=<id>` to see what was registered
4. **Update your File Tracker and Build Summaries**: For a Developer or Test Writer child, append its "Build summary (terse)"/"Test summary (terse)" and files to the tracker, per the File Tracker and Build Summaries section, for use in future delegation prompts
5. **Proceed**: Call `next_task()` to continue the workflow

If the child reports failure or the task is not `done`, handle accordingly:
- Re-read the task and child's summary to understand what went wrong
- If the child couldn't complete due to missing context, add context and re-delegate
- If there's a blocking issue, surface it to the user

## Model Routing

Each delegation runs on a named model. You pass it on the Task call as `model=`.

**Route by task, not by persona.** Several personas do jobs of different difficulty. The Critic reviews specifications and also triages test failures. The Developer designs implementation plans and also transcribes an approved plan into code. Design work gets `opus`. Mechanical work gets `sonnet`. Read the table row for the step you are delegating, not for the agent.

**The persona files cannot set the model.** They are plain markdown with no frontmatter. Children spawn as `subagent_type="general-purpose"` and then read a persona file. A `model:` key inside a persona file has no effect. The Task call is the only place the model takes effect.

**Fallback rule.** Two cases drop the parameter. A step is missing from the table, or this Claude Code version rejects `model` on the Task tool. In both cases omit `model=` and let the child inherit the session model. Never block the workflow on model routing. Say so once to the user, then continue.

## Context Curation Table

When gathering artifacts for delegation, use this lookup to find the model and the artifacts each agent/step needs:

| Step | Agent | Model | Artifacts to Include | Notes |
|------|-------|-------|---------------------|-------|
| 0 | Researcher (scope probe) | sonnet | — | Epic description and file system access. A quick look, not a codebase study |
| Direct | Developer (build and fix) | sonnet | `scope_probe` | Problem statement + probe. There is no plan |
| 2 | Researcher (codebase) | sonnet | `scope_probe` | Epic description, file system access, and the probe as a starting point |
| 3 | Researcher (web) | sonnet | `codebase_summary` | Codebase summary guides web research |
| 4 | Architect (spec) | opus | `codebase_summary`, `web_research` | Both research summaries. Writes the spec AND the decision record |
| 5 | Critic (review #1) | opus | `specification` | The spec to review |
| 8 | Critic (review #2) | opus | `specification`, previous `review_summary`, `decision_record` | Revised spec + prior questions. The decision record shows what is already settled |
| 10a | LLM Security Auditor (spec) | opus | `specification`, resolved questions | Approved spec + codebase access for security audit |
| 10c | LLM Security Auditor (spec #2) | opus | `specification`, `security_review`, resolved questions | Spec + prior security review + user responses |
| 11 | Architect (catalog) | opus | `specification` | Approved spec |
| 11a | Critic (catalog review) | opus | `catalog`, `specification` | Short document, highest-leverage review: every plan inherits this division of work |
| 11a | Architect (catalog revision) | opus | `catalog`, `specification`, `review_summary` | Applies cut directives and answered questions |
| 12 | Developer (plans) | opus | `specification`, `catalog`, `codebase_summary` | Spec, catalog item, research |
| 13 | Critic (review #3) | opus | `specification`, all `implementation_plan`, previous questions, `decision_record` | Spec + all plans. The decision record shows what is already settled |
| 14a | LLM Security Auditor (plans) | opus | `specification`, all `implementation_plan`, `security_review` (spec-level), resolved questions | Spec + all plans + prior security review |
| 14c | LLM Security Auditor (plans #2) | opus | `specification`, all `implementation_plan`, `security_review` (both), resolved questions | Spec + plans + both security reviews + user responses |
| 15 | Developer (build) | sonnet | `implementation_plan`, `specification` | Plan for this item + spec + source file list |
| 15a | Critic (plan/code reconciliation) | sonnet | `implementation_plan`, built source files for this item | Single pass, no loop — diffs the plan against the shipped code for one item, same pattern as 11a |
| 16 | Test Writer (unit) | sonnet | `specification`, `implementation_plan` | Spec + this item's plan + its built source files. Unit tests for this item only |
| 17a | Critic (triage) | sonnet | `specification`, `test_results`, `implementation_plan` | Spec + test output + plan + source code |
| 17b | Reviser | sonnet | `implementation_plan`, `triage_review`, `test_results`, `specification` | Current plan + triage + test output + spec |
| 17c | Developer (rebuild) | sonnet | `implementation_plan` (revised), `specification` | Revised plan + spec + source file list |
| 17d | Test Writer (revise) | sonnet | `triage_review`, `specification`, `test_results` | Triage feedback + spec + test files |
| 17r | Critic (code review round) | opus | `specification`, `implementation_plan`, `code_review_log` | One item's diff from its base SHA. Runs the review skill when available. Direct path: `scope_probe` in place of spec and plan |
| 17r | Developer (judge and fix) | (resumed) | the round's findings | Resume the item's build Developer with `SendMessage`. It keeps its model and context |
| Ladder | Researcher (code fact) | sonnet | the question, `answer_log` | Finds the fact and writes the answer log entry |
| Ladder | Architect (design question) | opus | `specification`, `decision_record`, `answer_log`, the question | Direct path: `scope_probe` in place of spec and decision record |
| 18 | Test Writer (integration) | sonnet | `specification`, `implementation_plan` | Same as step 16 but for integration tests |
| 19a-d | (same as 17a-d) | sonnet | (same as 17a-d) | Integration test triage/fix loop |
| 20a | Test Writer (acceptance) | sonnet | `specification`, `implementation_plan`, `test_results` | Run executable Acceptance Tests; reference existing tests, never duplicate |
| 20a/20c | Verifier | opus | `specification`, `implementation_plan`, `test_results`, `acceptance_verification` | Judge judgment-based ATs; confirm ACs — needs AC verification tables, manual procedures, and evidence artifacts (screenshots/benchmark output) |
| 20b | Critic (acceptance triage) | sonnet | `specification`, `test_results`, `implementation_plan` | Same as 17a, plus acceptance evidence |
| 6-7, 9-10, 14, 20d | Recording child (human review) | sonnet | answers collected inline | Writes `task_update` calls only, no reasoning work |

**The `answer_log` goes to every build-time child** (Steps 15 to 20, Step 17r, and the Direct path) once it exists, through the "Build-Time Rules" block of the delegation prompt. It is short by construction: one entry per answered question.

**The `decision_record` is not general context.** `artifact_list` returns it like any other artifact, but include it **only** at the steps that list it above: the Architect on a spec revision, the Critic at reviews #2 and #3, and the Architect answering a design question on the Question Ladder. It holds the reasoning behind decisions, which those two need in order to avoid re-opening settled ground. Nobody downstream does. A Developer building from an approved plan, a Test Writer, a Reviser and a Verifier all need the decision, and the spec already states it. Passing the decision record to them re-imports the tokens this split exists to remove.

**Compression**: Every delegation prompt tells the child to compress every context document. Include this block verbatim:

> For each context document below, call the `compress` MCP tool with its `file_path` and use the text it returns. Do NOT read the file yourself first. Reading it and then compressing it puts both copies in your context, which costs more than not compressing. Compression is for reading only: when you write or revise a document, write normal human-readable markdown to its path. Never save compressed text over a document.

There is no size threshold. A child cannot judge a document's size without reading it, which is the cost compression exists to avoid.

## Output Paths (document-producing steps)

For each document-producing task, pass `mode: document` + `doc path` + `artifact_type` in the Delegation Contract block (see the delegation prompt template). Derive `<epic-slug>` from the epic name. These are the paths the personas otherwise use as defaults — passing them explicitly is what keeps the delegation contract uniform with `/maps-lite`.

| Step | Agent | doc path | artifact_type |
|------|-------|----------|---------------|
| 2 | Researcher (codebase) | `.maps/docs/<epic-slug>/research/codebase-summary.md` | `codebase_summary` |
| 3 | Researcher (web) | `.maps/docs/<epic-slug>/research/web-research.md` | `web_research` |
| 4 | Architect (spec) | `.maps/docs/<epic-slug>/specification/spec.md` | `specification` |
| 4 | Architect (decision record) | `.maps/docs/<epic-slug>/specification/decisions.md` | `decision_record` |
| 11 | Architect (catalog) | `.maps/docs/<epic-slug>/catalog/implementation-catalog.md` | `catalog` |
| 12 | Developer (plan) | `.maps/docs/<epic-slug>/plans/<slug>.md` — derive `<slug>` from the catalog item name (lowercase kebab-case, e.g. `jwt-middleware.md`) | `implementation_plan` |
| 0 | Researcher (scope probe) | `.maps/docs/<epic-slug>/research/scope-probe.md` | `scope_probe` |
| 17r | Critic (review round) | `.maps/docs/<epic-slug>/reviews/code-review-<item-slug>.md` (append one section per round) | `code_review_log` |
| Ladder | Researcher or Architect | `.maps/docs/<epic-slug>/build/answers.md` (append one entry) | `answer_log` |

The `code_review_log` and `answer_log` rows are shared files that children append to. Do not pass them in a Delegation Contract block, because `document` mode means "write the whole file." Name the path in the task description with an append instruction, as the Code Review Loop and the Question Ladder describe. The Direct path uses `<item-slug>` = `direct`. On the Direct path, the orchestrator also saves `.maps/docs/<epic-slug>/research/direct-attempt.diff` (`direct_attempt`) on escalation.

Other document-producing agents (Critic reviews, Test Writer `test_results`, LLM Security Auditor, Verifier reports, Reviser revised plans) are **not yet contract-driven** — their personas still own their output paths, which is harmless (each writes a standalone document, not a shared one). Decoupling them is a later, optional step; until then, omit the Delegation Contract block for those tasks and they use their persona defaults.

## File Tracker and Build Summaries

Maintain a running, per-epic list of what each Developer and Test Writer child built,
not just which files. After each delegation that builds code or tests:

1. Read the child's final summary for "Files created", "Files modified", and
   "Build summary (terse)" (Developer) or "Test summary (terse)" (Test Writer).
2. Append one entry to the tracker, in build order:
   `<catalog item name> — Built: <bullet>; <bullet>; ... — Files: <path>, <path>`.
3. When delegating the next Developer (steps 15, 17c), include every prior Developer
   entry from this epic, verbatim, under a "Prior Work in This Epic — Developer"
   heading in the delegation prompt.
4. When delegating the Test Writer (steps 16, 18, 20a), include every prior Developer
   entry **and** every prior Test Writer entry, under two headings
   ("Prior Work in This Epic — Developer" and "— Test Writer").
5. Do not curate or filter this list for relevance before sending it. Pass it in full.
   It stays cheap because each entry is terse by construction (see the persona
   guidelines) — the receiving child judges relevance for its own upcoming task far
   better than you can from a bare file path, which is the gap this replaces.

This list is orchestrator-held conversation state, like the file tracker it replaces.
It is not an MCP artifact and is not registered via `artifact_register`. It is
cumulative within one epic only — never carry it across epics.

## Human Review (agent="user")

When `next_task` returns a task with `agent="user"`:

1. Fetch all relevant question tasks upfront with a **single** `task_list` call
2. Present questions to the user one at a time — collect all answers in conversation (no MCP calls during Q&A)
3. **Delegate recording to a child session** (`model="sonnet"`) — the child calls `task_update` for each answer and marks the human-review task done
4. After the child completes, proceed to `next_task` and create any follow-up tasks needed

**Why delegate recording:** MCP tool results stay in context for the entire session. Recording N answers inline adds N `task_update` responses to the main context permanently. Delegating recording keeps that chatter in the child's context window, not yours.

**What stays inline (never delegated):** Spec sign-off git commits, checkpoint commits on the work branch, and follow-up task creation — these are orchestration steps, not recording, and involve only 1-3 MCP calls total.

**Example: Open Question Resolution (Steps 7, 9, 14)**

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

**Example: Spec Sign-Off (Step 10)**

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

## Catalog Review and Approval (Steps 11a, 11b)

The catalog review is **a single Critic pass, not a loop.** The catalog is a short document and its findings are narrow, so a second automated round buys little.

1. **11a — Critic reviews the catalog.** One delegation. It produces cut directives and, for anything that changes the shape of the epic, `question` tasks.
2. **Architect revises.** It applies every cut directive without asking, as it does for the spec.
3. **11b — the user reviews and approves the catalog.** This runs on **every epic**, whether or not the Critic raised anything. Present the catalog, the Critic's findings, and any open questions in one sitting. Collect answers, then delegate the recording to a child.
4. **If the user asks for changes**, delegate the Architect again and return to step 3. This human loop has **no iteration limit**, matching the spec review loop: it ends when the user approves.

The catalog is not committed to git, so approval is recorded by marking the task done. There is no sign-off commit as there is at step 10.

Only after approval do you create the plan tasks. A catalog defect multiplies by the number of items, so nothing downstream should exist until the division of work is settled.

## Plan/Code Reconciliation (Step 15a)

One `agent-review` task per `implement` task, created at the same time as the `implement`
task (see "After Plans Approved (Step 14)" below) and blocked by that specific `implement`
task. **Single pass, no loop**, the same pattern as Step 11a.

Delegate the Critic to diff the plan against the shipped code for that one item. Read its
determination and route:

- **MATCH** → no action. Proceed.
- **PLAN STALE** → delegate the Developer to edit the plan file only. No rebuild, no code
  undo.
- **CODE WRONG** → code-undo (same mechanics as the test/fix loop), delegate the Developer
  to rebuild from the unchanged plan.
- **ESCALATE** → pause and ask the user, the same presentation as a "CRITERION WRONG"
  escalation.

This step does not consume the test/fix loop's 5-iteration budget. It runs once, before
any test has been written.

## Item Commits and the Work Branch

`/maps` commits its own code, on a work branch, and **never pushes**. The spec is `docs/specs/12-review-loop.md`. You do all git work below inline. It is orchestration, not agent work.

**Create the work branch** before the first build (Step 15, or step 1 of the Direct path):
1. Run `git status --porcelain`, ignoring paths under `.maps/`. If anything else is listed, stop and ask the user to commit or stash it. Do not continue until the tree is clean.
2. Record the branch the user is on: `config_set key="start_branch:<epic-id>" value="<branch>"`.
3. `git checkout -b maps/<epic-slug>`.

Never commit to the branch the user started on (the Step 10 spec commit is the one exception, and it happens before the work branch exists). Never push, open an MR, or merge.

**Checkpoint commits.** Commit at each of these points:
- an item's unit tests pass (end of Step 17 for that item);
- a code review round's fixes pass their tests;
- a Step 19 or Step 20b fix passes.

Each checkpoint is a new commit, never an amend. Stage only the files the File Tracker lists for this work. Never stage anything under `.maps/`. Follow the repo's commit-message conventions (read recent `git log` once). A message names the item and says what changed and why. It never cites a spec, plan, or decision-record ID.

**Code undo** keeps its current mechanics (see Test/Fix Loop). It now restores files to the last checkpoint commit. Never use `git reset --hard` or `git clean`, which can destroy uncommitted MAPS documents.

**Crash recovery.** On restart, if the epic has a work branch, check it out before you resume.

## Per-Item Build Loop (Steps 15 to 17r)

Items build **strictly one at a time**, in dependency order. The next item does not start until the current item's review loop has ended. Otherwise a checkpoint commit for one item could include another item's uncommitted files.

**Create each item's tasks only when they are needed.** At Step 14 only the `implement` and Step 15a tasks exist (see Creating Follow-Up Tasks). Create the unit test task, the triage and fix tasks, and each review round at the moment the step before it has truly finished. A task created early opens early: `next_task` returns open tasks in creation order, and a Test Writer marks its task `done` even when tests fail.

**The item hold.** The **hold target** is the next item's `implement` task, or the integration test task when this is the last item. It must stay blocked until the current item's loop ends. Whenever you create a task for the current item, add it as a blocker of the hold target (`blocker_add`) **before you call `next_task` again**. `blocker_add` sets the target back to `blocked` even if a cascade had just opened it. Never add a blocker that is already `done` or `deferred`: only `done` releases a blocked task, so a `deferred` blocker leaves the target blocked forever. If you must defer a task that is a blocker, first `blocker_remove` its edges.

**Fix tasks are not items.** Tasks named `Fix: <item>: <summary>` (from the Question Ladder or Decided for You) and `Review fixes: <item> round <n>` use type `implement` but are not catalog items. They never start a new item loop, record no item base, and get no Step 15a task. They run inside their item's loop, followed by that item's tests, a checkpoint commit, and a review round.

For each catalog item's `implement` task:
1. **Item base.** Record the work branch `HEAD`: `config_set key="item_base:<epic-id>:<item-slug>" value="<sha>"`. Every review round for this item diffs from this SHA.
2. **Build (Step 15).** Delegate the Developer. Keep its agent ID: the review loop resumes it. If Step 15a or the Test/Fix Loop later rebuilds the item, keep the newest Developer's agent ID instead.
3. **Reconcile (Step 15a).** As described above.
4. **Unit tests (Step 16).** Once Step 15a resolves to MATCH, or its correction is done, create `Unit tests: <item>` (type `test`, agent `test_writer`), hold, and delegate it for **this item's** unit tests.
5. **Triage and fix (Step 17).** The Test/Fix Loop, with a hard limit of 5 iterations **per item**. Hold every task it creates.
6. **Commit.** When the tests pass, a checkpoint commit.
7. **Code review (Step 17r).** Create `Code review round 1: <item>`, hold, and run the Code Review Loop below.

Integration tests (Steps 18 and 19) and Acceptance Verification (Step 20) run once, for the whole epic, after every item's review loop has ended.

## Code Review Loop (Step 17r)

Up to **3 rounds** per item. The reviewer reports. The Developer decides.

**Each round:**
1. **Review.** The round's task is `Code review round <n>: <item>` (type `agent-review`, agent `critic`). Delegate the Critic on `opus` with the Build-Time Rules block. Omit the Delegation Contract block: the review log is shared across rounds, so `document` mode would overwrite it. Instead, the task description names the review log path (Output Paths table) and says: append this round as a new section; never rewrite earlier sections; on round 1, create the file and register it as `code_review_log`. Give it the item base SHA from config. Tell it:
   - If `code_review_skill` is `available`: load the `code-reviewer-metarouter` skill and follow it to review the current branch, passing `--base <item base SHA>` to both `review_diff.py` and `codex_review.py`. Verify each finding against the source, as the skill requires. **Waiting on Codex:** a child cannot end its turn to wait, and one Bash call is capped at 10 minutes. Start `codex_review.py` in the background with its output redirected to a file under the system temp folder, then wait in the foreground with bounded loops (Bash timeout 600000), for example `timeout 540 bash -c 'until [ -s <file> ]; do sleep 15; done'`, repeated until the file holds the envelope. On a later round, the skill resumes its own Codex session.
   - If it is `unavailable`: review `git diff <item base SHA>..HEAD` directly. Use the severity scale Important / Nit / Pre-existing. An Important finding names a concrete consequence. At most two Nits.
   - Append this round to the review log: the verdict, then each finding with `file:line`, severity, consequence, and proposed fix.
   - Return the verdict on the first line: `LGTM`, `Needs changes (N)`, or, on the Direct path only, `ESCALATE: <risk signal>`.
   Route the verdict: `LGTM` ends the loop. `ESCALATE` runs the Direct path's Escalation. `Needs changes` goes to step 2.
2. **Reserve the next round.** Only when this is round 1 or 2: create `Code review round <n+1>: <item>` now and hold it, so the hold target cannot open while the fixes are uncommitted. Add it also as a blocker of any other task that waits on this review loop (on the Direct path, `User review: direct`). The reserved round is also a **second hold target**: every task you create before it runs (`Review fixes`, `Rerun tests`, triage and fix tasks, `Fix:` tasks, ladder questions) is added as a blocker of the reserved round too, so it cannot run before the fixes are tested and committed.
3. **Judge.** Resume the Developer that last built or rebuilt this item with `SendMessage` (see [Resuming a child](#resuming-a-child)) and send it the findings. If that child is no longer available, create `Review fixes: <item> round <n>` (type `implement`, agent `developer`), hold it, and delegate a fresh Developer with the review log, the item's plan (on the Direct path, the `scope_probe`), and the findings. The Developer answers each finding with exactly one outcome:
   - `FIX` — it applies the fix.
   - `DECLINE: <one-line reason>` — for example, the failure case cannot occur, or the finding contradicts the approved spec.
   - `CLIMB: <why it cannot decide>` — the finding goes up the Question Ladder as a **design** question.

   It applies its fixes, appends each finding's outcome to the review log, and returns. Run the Question Ladder for any `CLIMB` before the next step.
4. **Test the fixes.** If no finding was marked `FIX` and no ladder answer requires a change, skip to "The loop ends". Otherwise create `Rerun tests: <item> round <n>` (type `test`, agent `test_writer`), hold it, and delegate it to rerun this item's unit tests. A failure enters the item's Test/Fix Loop and shares its 5-iteration budget. On the Direct path there is no Test Writer and no plan: the resumed Developer reruns the probe's checks itself, within the Direct path's 2-iteration limit. When the checks pass, make a checkpoint commit.
5. **Next round.** Delegate the reserved round-(n+1) task. Resume the round-1 Critic with `SendMessage` when it is still available, and give it the new task's id: it must set that task `in_progress` and then `done`. Otherwise delegate a fresh Critic with the review log. Tell it: report Important findings only; confirm or correct each earlier finding's outcome against the code; a declined finding stays declined unless the code changes its reason.

**The loop ends** at the first of:
- the verdict is `LGTM`;
- a round has no finding the Developer marks `FIX`;
- round 3 has run. Any Important finding the Developer still wants fixed but could not settle climbs the Question Ladder. Nothing else carries forward.

If the loop ends while a reserved round task is still `open` or `blocked`, `blocker_remove` its edges first, then set it `deferred`.

Each declined finding goes on the [Decided for You](#decided-for-you) list.

## Question Ladder

Build-time children (Steps 15 to 20, Step 17r, and the Direct path) ask questions with `STATUS: NEEDS_ANSWER` (see the Return Protocol). **Steps 0 to 14 never use the ladder.** The spec stage keeps its open-question process, in which the user answers each question.

Handle the ladder as soon as a child returns `NEEDS_ANSWER`, before you call `next_task` again. Take each question through these levels, in order, and stop at the first level that answers it:

| Level | Who | Answers |
|---|---|---|
| 1 | You, inline | A question the `answer_log` or the spec already answers. Cite the entry or the section. Record nothing new. |
| 2 | Researcher on `sonnet` | Kind **code fact**: how existing code, a library, or a tool behaves. |
| 2 | Architect on `opus` | Kind **design**, including a review finding the Developer marked `CLIMB`. |
| 3 | The user | Kind **user only**, or anything level 2 returned `CANNOT_DECIDE` for. |

**Level 2.** Create a `question` task, parent = the asking task, agent `researcher` or `architect`, with the question block in its description. Delegate it with the Build-Time Rules block. Omit the Delegation Contract block: the answer log is shared, so `document` mode would overwrite it. Instead, the task description names the answer log path (Output Paths table) and says: append one entry; never rewrite earlier entries; if the file is new, create it and register it as `answer_log`. Tell the Architect: decide every design question that the approved spec leaves open, so that as few questions as possible reach the user. You may not change scope, change an acceptance criterion, or overrule a decision the user recorded. If the question needs one of those, mark the task done with results `CANNOT_DECIDE: <reason>` and write no entry. Otherwise append an answer log entry: the question, the answer, `answered by: <researcher|architect>`, and the asking task id. On the Direct path, also give the Architect the `RECOMMEND ESCALATION` rule from that section.

**Level 3.** Create a `question` task with `agent="user"` and a `human-review` task blocked by it, then run the normal Human Review flow: one question at a time, recorded by a child. Tell that recording child to also append an answer log entry with `answered by: user`.

**A question climbs once.** No level sends it back down, and the Architect does not delegate it.

**Hold every ladder task.** A `question` task created for an item's loop is also held (see The item hold), so the next item cannot start while a question is open.

**Resuming a child.** When every blocking question has an answer, resume the asking child with `SendMessage`, giving it the answers. Rewrite `.maps/.active_task` first. If the child is gone, for example after a crash, and its task is still `in_progress`, mark that task `orphaned` and create a replacement task. Hold the replacement. Its description holds the original task's description, the questions, the answers, and a note to read the file system for the partial work.

**Non-blocking questions.** The child already finished with its proposed defaults. Still take each question up the ladder. When an answer differs from the default, create a fix task, `Fix: <item>: <summary>` (type `implement`, agent `developer`), and hold it. It runs before the item's review loop ends, followed by the item's tests and a checkpoint commit.

**A user-only question on the Direct path.** If the Architect returns `RECOMMEND ESCALATION` and the user chooses to stay Direct, the question goes to level 3: the user answers it.

## Decided for You

At the user's next gate, show one short list, with no answer required:
- every level-2 **Architect** answer since the previous gate, one line each, from the answer log;
- every finding the Developer **declined**, with its reason, from the review logs.

The gates are: the Step 20d hand-off and epic completion, and the Direct path's user review. Say that the user may overrule any line. An overruled line becomes a fix task, `Fix: <item>: <summary>` (type `implement`, agent `developer`), followed by that item's tests, a checkpoint commit, and one review round. After every item's loop has ended there is no item hold target, so the epic (or, on the Direct path, `User review: direct`) is the hold target: add the fix task and every task created for it (tests, triage and fix tasks, the review round, ladder questions) as blockers of it, so it cannot complete first.

## Critical Review Loops

Critical reviews (steps 5, 8, 13) have a **3-iteration hard limit**. The catalog review at 11a is **not** one of them and has no loop:

**Loop structure:**
1. Delegate Critic review to child session → child creates `question` tasks
2. Handle user question resolution inline
3. Repeat if Critic finds NEW questions
4. After 3 iterations: pause, surface to user

**Termination conditions:**
- Critic finds zero new questions AND
- User signs off

**Cut directives do not gate the loop.** A Critic review summary may carry a `## Cut Directives` section alongside its questions. Those are not open questions and they are not counted here. Pass them to the Architect with the next revision, which applies them without user arbitration. Counting them would hold the loop open until it hit the iteration limit every time, because a document can always be tightened further.

If the limit is reached:
```
"Critical review has reached the 3-iteration limit and there are still
 [N] unresolved questions. Human intervention needed."

[Present questions to user, get decisions]
```

## LLM Security Review Loop

LLM security reviews (steps 10a-10d and 14a-14d) have a **2-iteration hard limit** and are **conditional** — they only run if the epic involves LLM integration.

**Check before creating any security review tasks:**
Call `config_get key="llm_security_review"`. If the value is `disabled`, skip this entire section — do not create any security review tasks and proceed directly to the next workflow step (catalog for spec review; implement tasks for plans review).

**Loop structure (spec review — steps 10a-10d):**
1. After user signs off on spec (step 10), create LLM Security Auditor task (type="agent-review", agent="llm_security_auditor")
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
task_create parent_id=<epic-id> type="agent-review" name="LLM Security Review: Specification" description="Review the approved specification for LLM-specific security vulnerabilities. Follow docs/guidelines/LLM_SECURITY_GUIDELINES.md." agent="llm_security_auditor"
```

**Creating the plans security review task (after step 14):**
```
task_create parent_id=<epic-id> type="agent-review" name="LLM Security Review: Implementation Plans" description="Review implementation plans for LLM-specific security vulnerabilities. Follow docs/guidelines/LLM_SECURITY_GUIDELINES.md." agent="llm_security_auditor"
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

## Escalating a Necessary Silent Failure

When a Developer's final summary's Issues field reports a silent failure it could not
avoid, create a `question` task (parent the relevant `implement` task, `agent="user"`)
naming the function and the Developer's stated reasons. Route it through the normal
Open Question Resolution process: present it to the user, who either accepts the
justification or requires a redesign. If a redesign is required, it becomes a new build
task like any other post-review fix.

## Test/Fix Loop

Test failures (steps 17, 19) have a **5-iteration hard limit**. In Step 17 the limit is **per item**, and test failures caused by code review fixes share it. When the tests pass, make a checkpoint commit (see Item Commits and the Work Branch).

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

Critic's results contain: "CRITERION WRONG"
→ Do NOT create fix tasks. Stop the loop for this criterion. Surface the Critic's reasoning to the user and ask whether to (a) amend the spec — revisit-earlier-phases: create new superseding spec/plan/verification tasks — or (b) overrule and resume the loop. (Primarily arises in Step 20b.)
```

**Hard limit reached:**
```
"Test/fix loop has reached the 5-iteration limit and [N] tests are still failing.
 Human intervention needed."

[Present failure summary, get user guidance]
```

## Acceptance Verification (Step 20)

After all integration tests pass (step 19), verify that every Acceptance Criterion in the spec is actually met. This is the "V" of the workflow — the Epic cannot complete until it is done.

**Setup (you handle this directly — it is orchestration):**
1. Read the signed-off spec's Acceptance Criteria (`AC-N`) and Acceptance Tests (`AT-N`), and each plan's Acceptance Criteria Verification table (and Manual Verification Procedures).
2. For each Acceptance Test, create an AT task (`type="acceptance-test"`, `name="<AT-N> — <name>"`, e.g. `name="AT-1 — Valid payload accepted"`):
   - MAPS-owned + executable → `agent="test_writer"`
   - MAPS-owned + judgment (benchmark analysis, visual/rendered output, inspection) → `agent="verifier"`
   - User-owned → `agent="user"`
3. For each Acceptance Criterion, create an AC task (`type="acceptance-criterion"`, `agent="verifier"`, `name="<AC-N> — <name>"`, e.g. `name="AC-3 — Notification latency under 100ms"`).
4. Wire blockers: each AC task blocked by its AT task(s); the Epic blocked by every AC task.
5. Cross-cutting criteria (tagged `**Scope:** cross-cutting`) are verified via their dedicated verification catalog item's plan — treat their ATs/ACs exactly like any other.

**Order of operations:**
1. **MAPS-owned first (20a):** delegate the MAPS-owned AT tasks — Test Writer runs executable ones (referencing existing unit/integration tests, never duplicating); Verifier judges judgment-based ones. An AT task is marked `done` only when it passes; a failure is recorded in `results`, not a status.
2. **Triage failures (20b):** a failed AT enters the SAME triage/fix loop as steps 17/19 (delegate Critic triage; route CODE/TEST/BOTH; 5-iteration hard limit; code-undo before rebuild). The Critic may also return CRITERION WRONG → stop and escalate to the user (see Triage routing). Each fix that passes gets a checkpoint commit.
3. **Confirm criteria (20c):** as each AC unblocks (its AT blockers clear → cascade sets it `open`), `next_task` surfaces it; delegate it to the Verifier, which records evidence + confidence and marks the AC `done`.
4. **User-owned last (20d):** once all MAPS-owned verification and fixes are complete and the build is stable, hand off to the user. Show the [Decided for You](#decided-for-you) list first. Then:
   - Build a **slim list** with a single `task_list type="acceptance-test" agent="user"` call — show each not-yet-`done` User-owned Acceptance Test as a one-line checklist.
   - Present the full detail (Setup/Action/Expected from the plan's Manual Verification Procedure) for the **next** one only — progressive disclosure. Do not dump all procedures.
   - As the user completes each, delegate recording (like other human-review recording) to mark the AT `done`, then delegate the Verifier to confirm the affected AC.

**Confidence:** the Verifier records Confirmed / Asserted / User-confirmed in each AC's `results` (an AC is only as strong as its weakest AT). Asserted criteria are surfaced to the user at hand-off but do NOT block Epic completion.

**Completion:** when every AC task is `done`, the Epic's blockers are all clear. Mark the Epic `in_progress`, then `done` and report the acceptance-verification summary (criteria verified, with confidence levels; any Asserted criteria flagged). Show any Decided for You lines added since 20d. Give the work branch name, `maps/<epic-slug>`, so the user can merge it or open an MR. Never push or merge it yourself.

**Regression after hand-off:** if a user-found failure triggers a rebuild, re-run the automated Acceptance Tests and create NEW re-verification AT tasks for affected manual criteria (forward-only — do not reopen a passed AT).

**Hard limit reached (20b):**
```
"Acceptance verification has reached the 5-iteration limit and [N] Acceptance Tests are still failing.
 Human intervention needed."

[Present failure summary + Critic's latest triage, get user guidance]
```

## Creating Follow-Up Tasks

As the workflow progresses, create tasks dynamically:

**After Critic Review #1 (Step 5):**
- Read the Critic child's summary to see how many questions were created
- Create a human review task (type="human-review", agent="user") to resolve them
- Block the human review task by all question tasks
- Create Critic Review #2 task, blocked by human review

**After Spec Sign-Off (Step 10):**
- Check `config_get key="llm_security_review"`:
  - If `enabled`: Create LLM security review task (type="agent-review", agent="llm_security_auditor"), block it by the sign-off task. Create catalog task (type="catalog", agent="architect"), block it by the security review task.
  - If `disabled`: Create catalog task directly, block it by the sign-off task only. No security review task created.

**After Catalog (Step 11):**
- Create the Catalog Review task (type="agent-review", agent="critic"), blocked by the catalog task
- Do NOT create plan tasks yet. Plan tasks are created after the user approves the catalog at 11b

**After Catalog Review (Step 11a):**
- Read the Critic's review summary
- Delegate the Architect to apply the `## Cut Directives` and revise the catalog for anything the Critic raised
- Create the catalog approval task (type="human-review", agent="user"), blocked by the Architect's revision
- If the Critic raised `question` tasks, they are resolved as part of 11b, in the same sitting as the approval

**After Catalog Approval (Step 11b):**
- For each catalog item: create `plan` task (type="plan", agent="developer")
- Add blocker relationships based on catalog's "blocked by" notes
- Create Critic Review #3 task, blocked by all plan tasks

**After Plans Approved (Step 14):**
- Check `config_get key="llm_security_review"`:
  - If `enabled`: Create LLM security review task for plans (type="agent-review", agent="llm_security_auditor"), block it by all plan question resolution tasks. After security review completes (and any follow-up questions resolved): create implement tasks, block all by the plans security review task.
  - If `disabled`: Create implement tasks directly, preserving blocker relationships from plans. No security review task created.
- Put the `implement` tasks in one dependency order (a topological order of the catalog's "blocked by" notes). Items build strictly one at a time in this order.
- For each item, create only its `implement` task and its Step 15a task (type="agent-review", agent="critic"), blocked by that `implement` task. The unit test task and review rounds are created later, when needed (see Per-Item Build Loop).
- Block each item's `implement` task by the previous item's Step 15a task. From then on, the item hold keeps it blocked until the previous item's loop ends.
- Create the integration test task (type="test", agent="test_writer"), blocked by the last item's Step 15a task. The item hold keeps it blocked too.

**After Integration Tests Pass (Step 19): set up Acceptance Verification (Step 20)**
- Materialize AT tasks (type="acceptance-test") and AC tasks (type="acceptance-criterion") from the spec + plans, and wire blockers (AT → AC → Epic) — see "Acceptance Verification (Step 20)" for the full procedure
- Block the acceptance-verification work by the integration test task

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
**Plan/Code Reconciliation**: Plan and code agree, or the mismatch was corrected, before unit testing begins (single pass, no loop)
**Code Review**: The item's last round is LGTM, or every remaining finding is declined with a reason or answered on the Question Ladder (3-round limit)
**Question Ladder**: Each question answered at the lowest level that can answer it; every level-2 and level-3 answer is in the answer log
**Tests**: All acceptance criteria have tests, tests run
**Critical Review**: Finds all gaps in one pass (3-iteration limit)
**LLM Security Review**: Identifies all LLM security concerns in one pass, or determines "not applicable" (2-iteration limit)
**Test/Fix**: All tests pass (5-iteration limit)
**Acceptance Verification**: Every Acceptance Criterion is confirmed (MAPS-owned automatically, User-owned via hand-off), each with a recorded confidence level; the Epic completes only when all AC tasks are done (5-iteration limit on the fix loop)

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
4. **Track files and build summaries**: Maintain your File Tracker and Build Summaries so each Developer/Test Writer child gets relevant source file context and every prior story's terse build summary, unfiltered.
5. **Forward-only status**: Never reopen completed tasks — create new tasks instead.
6. **Epic scoping**: All task/artifact operations are auto-scoped to current_epic_id.
7. **Orchestration stays with you**: Loop counting, follow-up task creation, triage routing, code undo, and crash recovery are YOUR job — never delegated.
8. **Context is curated**: Use the Context Curation Table to give each child exactly the context it needs, no more.
9. **Minimize inline MCP calls**: Every MCP tool response in the main process stays in context for the session. Prefer a single `task_list` to read questions, then delegate all write operations to a child.
10. **Commit, never push**: Commit code only on the `maps/<epic-slug>` work branch, at checkpoints. Never push, open an MR, or merge.
11. **Spec-stage questions stay with the user**: The Question Ladder is for build time only (Steps 15 to 20, Step 17r, the Direct path). In Steps 0 to 14 the user answers every open question, one at a time.

## Starting the Workflow

When the user provides a problem description:

```
User: "/maps I want to build a stock market investment tracking system"

You:
1. Create epic task
2. Set current_epic_id
3. Initialize project (.maps/ directories)
4. Detect the code review skill
5. Run Step 0, Intake. Stop here for Nothing; run the Direct Path for Direct
6. Full only: ask about LLM security review, create initial research tasks
7. Call next_task
6. Construct delegation prompt for Researcher
7. Delegate codebase analysis to child session via Task tool
8. Read child's results, update file tracker
9. Call next_task, delegate next task, repeat
```

Now begin the workflow based on the user's problem statement.
