# MAPS Specification: Intake (Step 0) and the Direct Path

## Status: Draft

## Overview
Intake is a new **Step 0** at the start of `/maps`. A short scope probe looks at the change before any research, spec, or plan exists. The orchestrator then recommends one of four outcomes, and the user decides:

- **Direct.** A mechanical change with one obvious approach. One build pass, the existing checks, the code review loop ([12-review-loop.md](12-review-loop.md)), and the user's review. No spec, no catalog, no plan.
- **Lite.** A small change that still needs a design decision. It runs `/maps-lite` ([09-maps-lite.md](09-maps-lite.md)).
- **Full.** Anything bigger. The normal 20-step workflow runs.
- **Nothing.** The change is already done, something else already covers it, or it is not worth its cost. Nothing is built.

The motivating case is routine maintenance, such as "upgrade this library to the next version and update every reference to its version number." Full `/maps` is far too heavy for that work, and `/maps-lite` is still more than it needs.

## Context
- Intake is part of the `/maps` command ([05-orchestrator.md](05-orchestrator.md)), not a separate command. The system routes the work, so the user does not have to judge its size before anything has been analyzed.
- `mr-maps` ([10-mr-maps.md](10-mr-maps.md)) inherits Intake from the base, with the MetaRouter deltas in [mr-maps](#mr-maps).
- `/maps-lite` is specified but not built. Until it exists, Intake offers only Direct, Full, and Nothing.
- The personas are reused unchanged. Intake-specific behavior reaches them through the Delegation Contract, as in `mr-maps`.

## Guiding Principles
1. **Look before routing.** A cheap probe of the code decides how much process a change needs. Routing on the problem statement alone guesses.
2. **The system recommends, the user decides.** Same rule as `/maps-lite` escalation. Intake never starts a path on its own.
3. **Mechanical, not small.** The Direct test is "one obvious approach, proved by existing checks," not a file count. A version bump across 40 files is Direct. A two-line change to a retry policy is not.
4. **Escalate without waste.** Work done on a path that turns out too small carries forward. The epic, the probe, and the task history stay.
5. **Keep the rigor that is cheap.** The Direct path drops the documents, not the checks or the independent review.

## Workflow

### Step 0 — Intake
Runs when `/mr-maps` or `/maps` starts a **new** epic. It does not run when the user resumes an existing epic.

1. **Setup.** The orchestrator runs the base Initial Setup steps 1 to 4: epic check, epic task, `current_epic_id`, `project_init`. The LLM-security question (step 5) and the research chain (step 6) wait until the outcome is Full.
2. **Scope probe.** The orchestrator creates `task_create type="research" agent="researcher" name="Scope probe"` and delegates it on `sonnet`. The probe writes `.maps/docs/<epic-slug>/research/scope-probe.md`, registered as `scope_probe` (see [The Scope Probe](#the-scope-probe)).
3. **Recommend.** The orchestrator reads the probe and asks the user with AskUserQuestion, the recommended outcome first, with its reason in one sentence.
4. **Record.** `config_set key="intake_outcome" value="direct|lite|full|nothing"`.
5. **Route.**
   - **Direct:** create the Direct task chain (see [The Direct Path](#the-direct-path)).
   - **Lite:** hand off to `/maps-lite` once it exists, with the probe as its context input.
   - **Full:** run base Initial Setup steps 5 and 6. The probe goes to the Step 2 codebase research task as an input, so Step 2 starts from it rather than from nothing.
   - **Nothing:** tell the user why, and set the epic to `deferred`.

### The Scope Probe
The probe is a quick look, not a codebase study. Its document stays under about one page and has five sections:

- **Touch list.** The files and locations the change reaches, grouped where the change repeats (for example, "every `package.json` that pins `left-pad`").
- **Approaches.** The reasonable ways to make the change. One line each.
- **Checks.** The existing commands that would prove the change works: build, unit tests, lint, type check. Discovered from the repo, not assumed.
- **Risk signals.** Each signal from the list below that applies, with one line of evidence.
- **Recommended outcome.** Direct, Lite, Full, or Nothing, with a one-sentence reason.

For a dependency change, the probe reads the dependency's changelog or release notes between the current and target versions. It uses web search only for this.

**Risk signals.** Any one of these rules out Direct:
- More than one reasonable approach.
- New behavior that new tests must prove. Updating the expected values in existing tests does not count.
- A schema or data migration.
- A change to an API contract that other code or other teams use.
- Authentication, secrets, or credentials.
- LLM integration.
- A breaking change in a dependency's changelog.

### The Direct Path
Task chain, created under the epic after the user picks Direct:

| Task | type | agent | Blocked by |
|---|---|---|---|
| Direct change | `implement` | `developer` | — |
| Code review round 1 | `agent-review` | `critic` | Direct change |
| User review | `human-review` | `user` | the last review round |

The Direct path uses the item commits, the code review loop, and the question ladder from [12-review-loop.md](12-review-loop.md), applied to a single item.

1. **Work branch.** The orchestrator creates `maps/<epic-slug>` from a clean `HEAD`, as at base Step 15.
2. **Build.** Delegate the Developer on `sonnet`. The brief is the user's problem statement plus the probe. There is no plan. The Developer makes the change and runs every check in the probe's Checks section.
3. **Fix loop.** On a failing check, the Developer reads the failure and fixes it. **Hard limit: 2 iterations.** A Direct change that needs more is not mechanical, so the Developer then returns `ESCALATE`.
4. **Escalate from the build.** The Developer returns `ESCALATE` with a reason when the change stops being mechanical: a breaking API change, a check failure that needs a design choice, or a second reasonable approach. The orchestrator then runs [Escalation](#escalation).
5. **Commit.** When every check passes, the orchestrator makes a checkpoint commit.
6. **Code review loop.** Up to 3 rounds, run by the Critic on `opus`, exactly as in [12-review-loop.md](12-review-loop.md#the-code-review-loop-step-17r). The Direct path adds three things:
   - **Extra checks in the reviewer's brief.** The change is complete across the probe's touch list. Nothing outside the touch list changed. No risk signal appeared during the build.
   - **An `ESCALATE` verdict.** The Critic returns it, instead of a finding, when a risk signal has appeared. The orchestrator then runs [Escalation](#escalation).
   - **A tighter fix budget.** A check that fails after a review fix shares the 2-iteration limit from step 3, not the 5-iteration limit of a full item.
7. **Questions.** Questions climb the question ladder. With no spec, the Architect answers against the problem statement and the probe. A question that needs a real design choice is itself a risk signal (more than one reasonable approach). The Architect then recommends escalation instead of deciding.
8. **User review.** The orchestrator shows the diff summary, the checks run, the review log's verdicts, the declined findings, and any decisions made for the user. The user approves, asks for changes, or escalates. A requested change goes back to the Developer and is checked and reviewed the same way.
9. **Done.** The change is committed on `maps/<epic-slug>`. The orchestrator never pushes or merges. The user merges the branch or opens an MR. The epic is marked `done`.

There is no Step 20. The problem statement and the probe's Checks section are the acceptance test, and the review loop and the user confirm it.

### Escalation
The user decides. The orchestrator offers Lite (once built) or Full, with the reason from the Developer or the Critic.

On escalation:
- The orchestrator restores any uncommitted change with the base code-undo procedure. It saves the whole attempt, `git diff <start>...HEAD`, to `.maps/docs/<epic-slug>/research/direct-attempt.diff`, registered as `direct_attempt`.
- It checks out the user's starting branch and renames the work branch to `maps/<epic-slug>-direct`. The branch is kept, not deleted. A later Step 15 then creates a fresh `maps/<epic-slug>`.
- The open Direct tasks are set to `deferred`. Forward-only status holds. No task is reopened.
- The epic stays. The probe and the saved diff go to the next path as inputs. For Full, both go to the Step 2 codebase research task.
- `config_set key="intake_outcome"` records the new outcome.

## mr-maps
`mr-maps` inherits Intake, with these deltas for the Direct path:

- **Story, not epic.** A Direct change is one Shortcut story. The orchestrator asks for its number, or creates it when `shortcut_write` is `enabled`. It may sit under an existing epic or under none.
- **Branch.** One branch, named as in `mr-maps` Overlay 4.1, off a freshly pulled `master`.
- **Cypress.** The Cypress gate runs the affected existing specs, selected by the Overlay 6 rule. A Direct change writes no new specs. If it needs one, it has new behavior, which rules out Direct.
- **Release flag.** A Direct change adds no behavior, so it has nothing to hide. The probe records this as a release-rule exception, and the user confirms it at the Intake recommendation.
- **Commits and MR.** Checkpoint commits go on the story branch, in place of the `maps/<epic-slug>` work branch. On escalation, the story branch is the one renamed. After the user review, the Developer drafts the MR description (Overlay 9). With no epic, the epic paragraph is left out.
- **Merge gate.** The Overlay 5 merge gate applies unchanged.

## Model Routing
| Step | Agent | Model | Why |
|---|---|---|---|
| 0 | Researcher (scope probe) | `sonnet` | Finds and lists. No design. |
| Direct | Developer (build and fix) | `sonnet` | Mechanical change, same as base Step 15. |
| Direct | Critic (code review rounds) | `opus` | The only independent check on a change with no spec or plan. Same routing as Step 17r in [12-review-loop.md](12-review-loop.md). |

## Loop Limits
- **Direct fix loop:** 2 iterations, shared by check failures during the build and after review fixes. Then the Developer returns `ESCALATE`.
- **Code review:** 3 rounds, as in [12-review-loop.md](12-review-loop.md).

## Requirements
- Adds Step 0, Intake, to `.claude/commands/maps.md`. It runs only when a new epic starts.
- The scope probe writes a `scope_probe` document of about one page with the five sections above, delegated to the Researcher on `sonnet`.
- The orchestrator recommends exactly one of Direct, Lite, Full, or Nothing, and the user decides. Lite is offered only when `/maps-lite` exists.
- The Direct path builds on a `maps/<epic-slug>` work branch, commits at checkpoints, runs the code review loop for up to 3 rounds, and ends at the user review. It writes no spec, catalog, or plan, and never pushes.
- The Direct fix loop stops at 2 iterations and escalates. The Critic can also escalate from any review round.
- Escalation restores uncommitted changes, saves the attempt's diff, keeps the work branch under a `-direct` name, defers the Direct tasks, and reuses the epic and the probe on the new path.
- `mr-maps` applies the deltas in [mr-maps](#mr-maps).
- No new MCP tools, no schema change, no persona edits. `scope_probe` and `direct_attempt` are new artifact types, which the server stores as free text.
- The telemetry hook works unchanged, because every delegation still has a task id in `.maps/.active_task`.

## Dependencies
- [05-orchestrator.md](05-orchestrator.md) — Initial Setup, delegation, code undo, and crash recovery.
- [07-workflow.md](07-workflow.md) — the Full path, unchanged.
- [04a-agent-researcher.md](04a-agent-researcher.md), [04c-agent-developer.md](04c-agent-developer.md), [04d-agent-critic.md](04d-agent-critic.md) — the reused personas.
- [09-maps-lite.md](09-maps-lite.md) — the Lite path, once built.
- [10-mr-maps.md](10-mr-maps.md) — the `mr-maps` overlays that the Direct path reuses.
- [10-telemetry.md](10-telemetry.md) — the `.active_task` marker.
- [12-review-loop.md](12-review-loop.md) — item commits, the code review loop, and the question ladder that the Direct path uses.

## Open Questions
1. ~~Where does Intake live?~~ **Resolved** — Step 0 inside `/maps`, so the system routes the work. A separate `/maps-direct` command would leave the routing to the user.
2. ~~Who reviews a Direct change?~~ **Resolved** — one Critic pass on the diff, then the user. *(Superseded by #7.)*
3. ~~What does Intake offer before `/maps-lite` is built?~~ **Resolved** — Direct, Full, and Nothing only.
4. ~~May the user skip the probe by naming an outcome at invocation?~~ **Resolved** — no. Intake always runs the probe on a new epic, and the user trusts it to route.
5. ~~Should `/maps-lite`'s sizing gate move into Intake?~~ **Resolved** — no. The `/maps-lite` sizing criteria are wrong, and Intake does not adopt them. Intake's criteria decide routing. The `/maps-lite` sizing gate is to be revisited when `/maps-lite` is built.
6. ~~Should the Critic diff review run on `opus` or `sonnet`?~~ **Resolved** — `opus`. It is the only independent check on a Direct change.
7. ~~Should a Direct change get a single Critic pass, or the full code review loop?~~ **Resolved** — the code review loop from [12-review-loop.md](12-review-loop.md), up to 3 rounds, with checkpoint commits on a work branch. Every path then reviews and commits the same way. Supersedes #2.

## Version History
| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1.0 | 2026-11-25 | Mike Andersen | Initial draft. Step 0 Intake with a scope probe and four outcomes (Direct, Lite, Full, Nothing). Direct path with a Critic diff review and a 2-iteration fix loop. Escalation in place. `mr-maps` deltas. Resolved open questions #1 to #6. |
| 0.1.1 | 2026-11-25 | Mike Andersen | The Direct path now uses the item commits, the 3-round code review loop, and the question ladder from 12-review-loop.md, in place of a single Critic pass. Escalation keeps the attempt on a `-direct` branch. Resolved open question #7. |
