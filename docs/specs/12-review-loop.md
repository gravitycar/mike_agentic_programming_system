# MAPS Specification: Item Commits, the Code Review Loop, and the Question Ladder

## Status: Draft

## Overview
This spec changes how `/maps` builds code after the plans are approved (Steps 15 to 17). It adds four things:

1. **Item commits.** `/maps` commits its own code on a work branch, one item at a time. It never pushes.
2. **A per-item build loop.** Each catalog item is built, reconciled, unit-tested, committed, and reviewed before the next item starts. Integration tests (Steps 18 and 19) and acceptance verification (Step 20) stay at epic level.
3. **A code review loop.** Each item's commit gets up to three review rounds. The reviewer is the `code-reviewer-metarouter` skill when it is installed, run by a Critic child, and otherwise the Critic itself. The Developer judges each finding.
4. **A question ladder.** A build-time child that needs an answer returns a question instead of guessing or stopping. The question climbs one level at a time, from the child to the orchestrator to the Researcher or Architect, and reaches the user only when no level below can answer it.

The spec stage does not change. Steps 1 to 14 keep the current open-question process, in which the Critic raises questions and the user answers them one at a time.

`mr-maps` ([10-mr-maps.md](10-mr-maps.md)) inherits all four. Its Overlay 5 shrinks to the parts that are MetaRouter-specific (see [mr-maps](#mr-maps)).

## Context
- **Why commits.** The review skill diffs committed code on the current branch against the default branch. Base `/maps` had no step that commits code, so the skill had nothing to review. The user now accepts sub-agents committing their own code, so the loop can live in base `/maps`.
- **Why per item.** A review of one item's diff, with its tests already passing, finds more than a review of a whole epic's diff. Andy Lin's agent setup reviews one branch at a time. Its median MR is about 310 added lines.
- **Why a ladder.** Today a build-time child that hits an unknown either guesses or escalates to the user. Most of these questions have an answer in the code, the spec, or an earlier answer. The ladder answers them below the user, so the user gets fewer interruptions during the build.
- **Reviewer rules.** The severity, nit, re-review, and verification rules come from the skill's `review-principles.md`. This spec applies the same rules to the Critic when it reviews without the skill.

## Guiding Principles
1. **The spec stage stays human.** The user's question-and-answer process for the spec and the plans is unchanged. Everything in this spec applies from Step 15 on.
2. **Answer at the lowest level that can see the whole answer.** A question goes to the user only when no agent below can answer it inside the approved spec.
3. **The reviewer reports, the Developer decides.** A finding is evidence. The Developer fixes it, declines it with a reason, or sends it up the ladder.
4. **Reviews converge.** Later rounds raise Important findings only, respect declined findings, and stop at three rounds.
5. **Nothing is hidden.** Every declined finding and every decision made below the user appears at the user's next gate.
6. **Commit locally, never push.** Pushing, opening MRs, and merging stay with the user.

## Item Commits
**The work branch.** At the start of Step 15, `/maps` creates `maps/<epic-slug>` from the current `HEAD` and checks it out. The working tree must be clean. If it is not, the orchestrator stops and asks the user to commit or stash first. `/maps` never commits to the branch the user started on, and never pushes.

**Checkpoint commits.** The orchestrator commits, inline, at these points:
- an item's unit tests pass (after Step 17 for that item);
- a review round's fixes pass their tests;
- a Step 19 or Step 20 fix passes.

Each checkpoint is a new commit, not an amend. Commit messages follow the repo's own conventions, discovered at runtime. A message names the item and says what changed and why. It never cites spec or plan IDs.

**Code undo.** The existing procedure is unchanged: restore modified files with `git checkout`, and delete the new files the file tracker lists. It now restores to the last checkpoint commit rather than to the state before Step 15. `git reset --hard` and `git clean` are never used, because they can destroy uncommitted MAPS documents.

**Step 10 is unchanged.** The base spec sign-off commit happens on the user's branch, before the work branch exists.

## The Per-Item Build Loop (replaces Steps 15 to 17)
For each `implement` task, in dependency order:

1. **Build (Step 15).** The Developer builds the item from its plan.
2. **Reconcile (Step 15a).** The Critic compares the plan with the code, as today.
3. **Unit tests (Step 16).** The Test Writer writes and runs the unit tests for this item.
4. **Triage and fix (Step 17).** As today, with a hard limit of 5 iterations per item.
5. **Commit.** A checkpoint commit (see [Item Commits](#item-commits)).
6. **Code review (Step 17r).** The review loop below.

**Items run strictly one at a time.** The next item does not start until the current item's review loop has ended. Otherwise a checkpoint commit for one item could include another item's uncommitted files.

**Task wiring (after Step 14).** Per item, only the `implement` task and its Step 15a task exist at first. Each item's `implement` task is blocked by the previous item's Step 15a task, and the Step 18 integration test task by the last item's. The unit test task, triage and fix tasks, review rounds, and ladder questions are created only when needed: `next_task` returns open tasks in creation order, so a task created early would open early.

**The item hold.** The next item's `implement` task (or the Step 18 task, after the last item) is the hold target. Every task created for the current item is added as a blocker of the hold target before the orchestrator asks `next_task` for more work. `blocker_add` re-blocks a target that a cascade just opened. Only `done` releases a blocker, so a task is never deferred while it is a blocker: its edges are removed first. Before resuming the Developer on `Needs changes`, the orchestrator reserves the next review round as a held task, so nothing can open while review fixes are uncommitted. The reserved round is itself a second hold target: every task created for the current round's fixes also blocks it, so it cannot run before those fixes are tested and committed.

Steps 18 to 20 are unchanged.

## The Code Review Loop (Step 17r)

### Setup: detect the skill
During Initial Setup, the orchestrator searches the available skills for `code-reviewer-metarouter`. The skill counts as available only when its `review_diff.py` accepts `--base`, which MetaRouter plugin 0.22.0 and later do. Without `--base`, the skill can only diff against the default branch, and a shared work branch would make every item's review include every earlier item. The orchestrator records `config_set key="code_review_skill" value="available|unavailable"`.

**Scoping a review to one item.** Before an item's build starts, the orchestrator records the work branch's `HEAD` SHA as that item's base. Every review round for the item passes that SHA as `--base` to the skill's scripts, so the reviewer sees only this item's commits. In `mr-maps` the story branch starts from `master`, so the story's base is the commit it branched from.

**Python.** The skill's scripts run under `python3`. A repo that pins tool versions (for example with asdf) must make a Python 3 available, or the Critic falls back to the native review.

### Each round
1. **Review.** The orchestrator creates an `agent-review` task named `Code review round <n>: <item>` and delegates the Critic on `opus`.
   - With the skill available, the Critic runs it against the work branch, with `--base` set to the item's base SHA, and verifies each finding against the source, as the skill's own instructions require. When the skill uses Codex, a review can run longer than a child's 10-minute command limit. The Critic therefore starts the review in the background and waits in a loop of bounded checks.
   - Without the skill, the Critic reviews `git diff <item base>..HEAD` itself, applying the [Critic build-time rules](#critic-build-time-rules) and the skill's severity scale (Important, Nit, Pre-existing).
   - The Critic writes the round's report to the item's review log and returns a verdict: `LGTM` or `Needs changes (N)`.
2. **Judge.** On `Needs changes`, the orchestrator resumes the item's build Developer child (see [Resuming children](#resuming-children)) with the findings. For each finding the Developer chooses one of three outcomes:
   - **Fix.**
   - **Decline**, with a one-line reason. Examples: the failure case cannot occur, or the finding contradicts the approved spec.
   - **Climb**, when it cannot decide. The finding goes up the [question ladder](#the-question-ladder) as a design question.
3. **Fix and test.** The Developer applies its fixes. The Test Writer reruns the item's unit tests. A failure enters the item's Step 17 triage loop and shares its 5-iteration budget. When the tests pass, the orchestrator makes a checkpoint commit.
4. **Record.** The Developer writes each finding's outcome to the review log.

### Later rounds
- The orchestrator resumes the round-1 Critic child when it is still available. Otherwise a fresh Critic gets the previous report and the review log. With the skill, a re-review also resumes the skill's own Codex session, so Codex remembers what it flagged.
- Later rounds report **Important findings only**. They raise no new nits.
- A declined finding stays declined unless the code changes its reason.
- The reviewer confirms or corrects each earlier finding's outcome against the code.

### Ending the loop
The loop ends at the first of these:
- the verdict is `LGTM`;
- a round has no finding the Developer will fix;
- **round 3** has run. Any Important finding the Developer still wants fixed but could not settle climbs the question ladder. Nothing else is carried forward.

### The review log
One document per item: `.maps/docs/<epic-slug>/reviews/code-review-<item-slug>.md`, registered as `code_review_log`. It records, for each round, the verdict and each finding with its outcome: fixed (with the commit), declined (with the reason), or climbed (with the answer).

## Critic Build-Time Rules
These rules go into the Critic's Delegation Contract for every build-time task: Step 15a reconciliation, the Step 17, 19 and 20b triage loops, the code review loop, and the Direct-path diff review ([11-intake.md](11-intake.md)). They do **not** apply to critical reviews #1 to #3, the catalog review, or any spec-stage task.

1. **Answer from the code first.** Read the changed code, its callers, and its tests, and run a focused test where useful, before raising a question.
2. **Back every claim with a `file:line`.** A finding the Critic could not trace is phrased as a question that names what it could not check. That question goes up the ladder.
3. **Respect settled ground.** The approved spec, the answer log, and findings the Developer declined are settled. Do not reopen them unless the code changes the reason.
4. **After round 1, report Important findings only.** An Important finding names a concrete consequence. Anything else is a Nit, with at most two per review.

## The Question Ladder
The ladder covers every build-time step: Steps 15 to 20, the code review loop, and the Direct path. Spec-stage steps keep their current open-question process.

### Asking
A build-time child that needs an answer it cannot find returns `STATUS: NEEDS_ANSWER` in its final message, with each question in this form:

```markdown
### Q<n>: <the question in one sentence>
- **Checked:** <what the child read or ran>
- **Blocking:** yes | no
- **Proposed default:** <the answer the child would choose>
- **Kind:** code fact | design | user only
```

- A child with only **non-blocking** questions finishes its work using its proposed defaults. It marks its task `done` and lists the questions as assumptions. If an answer later differs from a default, the orchestrator creates a follow-up task to change the work.
- A child with any **blocking** question stops and leaves its task `in_progress`.
- **User only** is for questions no agent may answer: scope, an acceptance criterion, a decision the user recorded, a credential, or a cost the user must accept.

### Climbing
| Level | Who answers | What it may answer |
|---|---|---|
| 0 | The asking child | Anything the code or its context documents answer. This is the "answer from the code first" rule. |
| 1 | The orchestrator, inline | A question the answer log or the spec already answers. The orchestrator cites the entry or the section. |
| 2 | Researcher on `sonnet` | A **code fact**: how existing code, a library, or a tool behaves. |
| 2 | Architect on `opus` | A **design** question, including a review finding the Developer could not judge. |
| 3 | The user | A **user only** question, or anything level 2 could not answer. |

**The Architect's authority.** The Architect gets the spec, the decision record, the answer log, and the question. It decides every design question that the approved spec leaves open, so that as few questions as possible reach the user. It may not change scope, change an acceptance criterion, or overrule a decision the user recorded. A question that needs one of those it returns as `CANNOT_DECIDE`, with the reason, and the question goes to level 3.

**Level 3** uses the existing `question` task and human-review flow: one question at a time, recorded by a child.

A question climbs once. No level sends it back down, and the Architect does not delegate it further.

### Answering
**Resuming children.** The orchestrator resumes the child that asked, with the answer, through `SendMessage`. The child keeps its context and continues where it stopped. If that child is no longer available, for example after a crash, a fresh child gets the same task with its partial work, its questions, and the answers.

**The answer log.** Every answer from levels 2 and 3 goes into `.maps/docs/<epic-slug>/build/answers.md`, registered as `answer_log`. Each entry holds the question, the answer, who answered it, and the task that asked. The answering child writes the entry. For level 3, the existing answer-recording child writes it. Every later build-time child gets the answer log in its Delegation Contract, so no question is asked twice. The answer log is kept separate from the decision record, which stays limited to the steps that list it today.

**Decided for you.** At the user's next gate, the orchestrator lists every level-2 Architect decision made since the previous gate, each in one line. In base `/maps` the gates are the Step 20d user-owned acceptance tests and epic completion. In `mr-maps` the gate is each story's merge gate. The same list shows every finding the Developer declined, with its reason. The user does not have to answer anything on this list. An overruled entry becomes a follow-up task.

## mr-maps
`mr-maps` inherits item commits, the per-item loop, the review loop, the Critic rules, and the ladder. Its own deltas:

- **Branches.** Each story builds on its own branch off a fresh `master` (Overlay 4.1), in place of the base `maps/<epic-slug>` work branch.
- **Testing.** The Cypress gate (Overlay 6) runs as part of the item's test step, before the commit. Review fixes rerun the affected Cypress specs as well as the unit tests.
- **The release rule.** The reviewer checks it in every round, as the Step 15a Critic does today.
- **Order of the story loop.** Branch → build → Step 15a → unit tests and Cypress → triage → commit → review loop → MR description → merge gate.
- **The MR description** (Overlay 9) lists the declined findings that matter to a reviewer under "Known limitations, trade-offs, and technical debt."
- **Documents.** The review log and the answer log live under `.maps/` and are never committed, as with every other MAPS document.

## Model Routing
| Step | Agent | Model | Why |
|---|---|---|---|
| 17r | Critic (review round) | `opus` | Judgment over a real diff. Runs the skill when available. |
| 17r | Developer (judge and fix) | the build child's model | The orchestrator resumes the item's build child, which keeps its model. |
| Ladder | Researcher (code fact) | `sonnet` | Finds facts. No design. |
| Ladder | Architect (design question) | `opus` | Makes design decisions on the user's behalf. |

## Loop Limits
- **Code review:** 3 rounds per item.
- **Unit test triage and fix:** 5 iterations per item, shared with test failures caused by review fixes.
- **Question ladder:** each question climbs at most once through each level.

## Requirements
- `/maps` creates `maps/<epic-slug>` from a clean `HEAD` at Step 15, commits at each checkpoint, and never pushes or commits to the user's starting branch.
- Steps 15 to 17 run per item, followed by a checkpoint commit and the code review loop. Steps 18 to 20 stay at epic level.
- Initial Setup records `code_review_skill`. The Critic runs `code-reviewer-metarouter` when it is available and reviews natively otherwise, under the same rules.
- The review loop runs at most 3 rounds per item. The Developer judges every finding as fix, decline, or climb. Later rounds raise Important findings only and respect declined findings.
- Each item has a `code_review_log`. Each epic has an `answer_log`.
- The Critic build-time rules are in the Critic's Delegation Contract for build-time tasks only.
- Build-time children can return `NEEDS_ANSWER`. Questions climb through the orchestrator, the Researcher or the Architect, and the user, in that order. The orchestrator resumes the asking child with the answer.
- The Architect decides every design question the approved spec leaves open, and returns `CANNOT_DECIDE` only for scope, acceptance criteria, recorded user decisions, credentials, or costs.
- The user's next gate lists the Architect's decisions and the declined findings, without requiring an answer.
- The spec-stage open-question process (Steps 1 to 14) is unchanged.
- No new MCP tools and no schema change. `code_review_log` and `answer_log` are new artifact types, which the server stores as free text.

## Affected Documents
Implementing this spec changes:
- `.claude/commands/maps.md`: Initial Setup (skill detection), Steps 15 to 17, the task wiring after Step 14, code undo, the Return Protocol (`NEEDS_ANSWER`), the Context Curation Table (answer log), the Critic Delegation Contract, and the human gates (the "decided for you" list).
- `.claude/commands/mr-maps.md`: Overlay 5 (reduced to the deltas above), Overlay 2 (the new document paths), and the Delegation Contract Overlay.
- [05-orchestrator.md](05-orchestrator.md), [07-workflow.md](07-workflow.md), [10-mr-maps.md](10-mr-maps.md), and [11-intake.md](11-intake.md).
- `CLAUDE.md`: the workflow overview, the loop hard limits, and the specification index.

## Dependencies
- [05-orchestrator.md](05-orchestrator.md) — delegation, the Return Protocol, code undo, and crash recovery.
- [07-workflow.md](07-workflow.md) — Steps 15 to 20.
- [04b-agent-architect.md](04b-agent-architect.md), [04c-agent-developer.md](04c-agent-developer.md), [04d-agent-critic.md](04d-agent-critic.md), [04a-agent-researcher.md](04a-agent-researcher.md) — the reused personas.
- [10-mr-maps.md](10-mr-maps.md) and [11-intake.md](11-intake.md) — the variants that inherit this loop.
- External: the `code-reviewer-metarouter` skill from the MetaRouter Claude plugin, 0.22.0 or later (optional), with a Python 3 on the path, and the Codex CLI that skill uses when it is installed (optional).

## Open Questions
1. ~~May `/maps` children commit code?~~ **Resolved** — yes, on a `maps/<epic-slug>` work branch, at checkpoints, never pushed.
2. ~~Should the review loop run once per epic or once per item?~~ **Resolved** — per item. Steps 15 to 17 become a per-item loop.
3. ~~Who judges a review finding?~~ **Resolved** — the Developer. A finding it cannot judge climbs to the Architect, then to the user.
4. ~~How many review rounds?~~ **Resolved** — 3.
5. ~~Who decides design questions during implementation?~~ **Resolved** — the Architect, inside the approved spec. The spec-stage question process is unchanged.
6. ~~After a child asks a question, does the orchestrator resume it or start a fresh one?~~ **Resolved** — it resumes the same child, and falls back to a fresh one only when the child is gone.
7. ~~Should the Direct path in [11-intake.md](11-intake.md) use this review loop and commit on the work branch?~~ **Resolved** — yes. Every path reviews and commits the same way. See 11-intake.md v0.1.1.
8. ~~Should the Developer that judges findings run on `opus` instead of the resumed `sonnet` build child?~~ **Resolved** — keep the resumed `sonnet` build child, for its build context. A finding it cannot judge climbs to the Architect on `opus`, so the hard calls still get `opus`.

9. ~~The installed skill (0.4.10) could only diff against the default branch. How does a base `/maps` review see only one item?~~ **Resolved** — require MetaRouter plugin 0.22.0 or later, whose scripts accept `--base`, and pass the item's starting SHA. An older skill counts as unavailable, and the Critic reviews natively.

## Version History
| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1.0 | 2026-11-25 | Mike Andersen | Initial draft. Item commits on a work branch, a per-item build loop, a 3-round code review loop using `code-reviewer-metarouter` when available, Critic build-time rules, and the question ladder. Resolved open questions #1 to #6. |
| 0.1.1 | 2026-11-25 | Mike Andersen | Resolved open questions #7 and #8: the Direct path uses this loop, and the resumed `sonnet` build child judges findings. |
| 0.1.2 | 2026-11-25 | Mike Andersen | Scoped each review to one item with the skill's `--base` option (plugin 0.22.0 or later). Resolved open question #9. |
