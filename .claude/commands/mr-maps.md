# mr-maps - MetaRouter / Shortcut Variant of MAPS

You are executing the `/mr-maps` command ("Mister Maps"), the MetaRouter variant of `/maps`. It runs the same spec-driven workflow, adapted to MetaRouter repositories, the Shortcut epic/story model, and MetaRouter's git and testing discipline. It works in any MetaRouter GitLab or GitHub repo. Discover each repo's actual conventions at runtime rather than assuming one project's layout.

## How to Read This Command

Your base workflow is the stock `/maps` command at `.claude/commands/maps.md`. **Read that file first and follow it**, except where this overlay changes it. On every point this overlay addresses, this overlay is authoritative and supersedes the base.

This overlay does not repeat the base. It changes eight areas:
1. Document paths. Every MAPS document stays local under `.maps/`, and only code and tests are committed.
2. Shortcut epic and story numbers, plus a new Story Reconciler step (11c). The base's catalog review (11a) and catalog approval (11b) are inherited unchanged and run before it.
3. Git branches (one story, one branch, always off `master`) in place of the base work branch, and a per-story version of the base build loop that ends at a merge gate.
4. Testing (unit plus Cypress, no classic integration tier).
5. Story sizing: a logical grouping (component or package), not a file/line ceiling. This overlay overrides the base here, to keep review rounds per epic low.
6. A draft MR description for each story, for the user to paste (Overlay 9).
7. A release flag: every story merges dark, and the flag turns the feature on after the last feature story merges (Overlay 10).
8. Step 0 Intake: a Direct change becomes one story with its own branch, Cypress gate, and MR description (Overlay 11).

Everything else is inherited unchanged from the base: the session-delegation model, critical review loops (3 iterations), the conditional LLM security review, human-review recording via a child, crash recovery, loop tracking, and error handling. The reference spec is `docs/specs/10-mr-maps.md`.

## Environment and Prerequisites

- `/mr-maps` runs inside a MetaRouter repository (any MetaRouter GitLab or GitHub repo). All paths below are relative to the repo root.
- It needs the Shortcut MCP server. A **read-capable** Shortcut MCP is required. A **write-capable** one is optional and enables auto-creation of the epic and stories. Find Shortcut tools with ToolSearch.
- **Detect write capability once, at start.** Search for a Shortcut create-story tool. Record the result: `config_set key="shortcut_write" value="enabled"` or `value="disabled"`. This drives the read-only fallback later.

## Terminology Map

- **Shortcut epic** = the MAPS epic = the step-1 problem statement.
- **Shortcut story** = one catalog item = one implementation plan = one `implement` task = one git branch.
- There is no new "story" task type. A story is represented by its `plan` and `implement` tasks, which carry its Shortcut number in the `shortcut_story_id` column.
- A **merge gate** (Overlay 5) is a `human-review` task per story that stays open until the user merges that story's MR. The **release gate** (Overlay 10) stays open until the user turns the release flag on and the feature is stable.

---

## Overlay 1 — Initial Setup (Step 1)

Follow the base "Initial Setup", with these additions.

**Capture the Shortcut epic number (Full path only).** Run this after Step 0 Intake, once the user picks Full. Step 11c needs it to find and create the epic's stories. A Direct change has no epic of its own (Overlay 11).
- If `shortcut_write` is `enabled` and the epic does not yet exist, create it in Shortcut and read back its number.
- Otherwise, ask the user for the Shortcut epic number, or ask them to create the epic in Shortcut and give you the number.
- Record it: `config_set key="shortcut_epic_number" value="<n>"`.

**project_init still runs.** It creates `.maps/` and `.maps/maps.db` as in the base. Every MAPS document lives under `.maps/` (Overlay 2).

**Keep `.maps/` out of git.** Run `git check-ignore -q .maps/`. If it fails, append `.maps/` to the repo's local exclude file, `$(git rev-parse --git-common-dir)/info/exclude`. Git never commits that file, and every worktree of the clone shares it. Never edit the repo's `.gitignore` for this, because that edit would itself need a commit.

The rest of setup (epic task, `current_epic_id`, the code review skill check, Step 0 Intake, the LLM-security question, the initial research chain) is unchanged.

---

## Overlay 2 — Document Paths (supersedes the base "Output Paths" table)

Every MAPS document is local working material for the agents and the user. **No document is committed** on any branch, including the spec and the plans. Colleagues review code and tests only. A reviewer therefore never checks a document against the code, and a code change never forces a document update. The MR description (Overlay 9) gives reviewers the context they need.

Use this table in every Delegation Contract in place of the base "Output Paths" table. `<story#>` is the plan task's `shortcut_story_id`. `<slug>` is the lowercase kebab-case slug of the catalog item name.

| Step | Agent | doc path | artifact_type |
|------|-------|----------|---------------|
| 2 | Researcher (codebase) | `.maps/docs/<epic-slug>/research/codebase-summary.md` | `codebase_summary` |
| 3 | Researcher (web) | `.maps/docs/<epic-slug>/research/web-research.md` | `web_research` |
| 4 | Architect (spec) | `.maps/docs/<epic-slug>/specification/<spec-name>.md` | `specification` |
| 4 | Architect (decision record) | `.maps/docs/<epic-slug>/specification/decisions.md` | `decision_record` |
| 11 | Architect (catalog) | `.maps/docs/<epic-slug>/catalog/implementation-catalog.md` | `catalog` |
| 11c | Story Reconciler | `.maps/docs/<epic-slug>/reconciliation/story-reconciliation.md` | `story_reconciliation` |
| 12 | Developer (plan) | `.maps/docs/<epic-slug>/plans/sc-<story#>_<slug>.md` | `implementation_plan` |
| 0 | Researcher (scope probe) | `.maps/docs/<epic-slug>/research/scope-probe.md` | `scope_probe` |
| Overlay 9 | Developer (MR description) | `.maps/docs/<epic-slug>/mr/sc-<story#>.md` | `mr_description` |
| 17r | Critic (review round) | `.maps/docs/<epic-slug>/reviews/code-review-sc-<story#>.md` (append one section per round) | `code_review_log` |
| Ladder | Researcher or Architect | `.maps/docs/<epic-slug>/build/answers.md` (append one entry) | `answer_log` |

Rules:
- Always pass an explicit `doc path` in the Delegation Contract. The plan and MR-description names carry the story number, which no persona default knows.
- Register every document with its real path. The artifacts table stays the source of truth for lookup.
- The `code_review_log` and `answer_log` rows are append-only shared files. Follow the base rule: never pass them in a Delegation Contract block; name the path in the task description with an append instruction.
- The `<spec-name>` is a short kebab-case name for the spec, for example `audit-log-triggers.md`. Choose it once at step 4 and reuse it.
- **No sign-off commit at step 10.** The base commits the spec at sign-off. `mr-maps` skips that commit. It marks the sign-off task `done` and moves on to step 11.

---

## Overlay 3 — Shortcut Story Numbers and the Story Reconciler (Step 11c, NEW)

This step sits between catalog approval (step 11) and plan writing (step 12). Its job is to give every catalog item a real Shortcut story number, without creating duplicates.

**Order of operations changes slightly from the base.** The base runs 11a (Critic catalog review) and 11b (user approval) first, then creates plan tasks. `mr-maps` inherits both unchanged and inserts 11c after them:
1. Run the base's 11a and 11b. **Nothing is filed in Shortcut from an unreviewed catalog.** Story numbers are assigned from an approved division of work, which is why 11c comes last.
2. After the user approves the catalog at 11b, create one `plan` task per catalog item (type `plan`, agent `developer`), with blockers from the catalog's "blocked by" notes, exactly as the base does. Do **not** write the plans yet, and do not create the Critic Review #3 task yet.
3. Run Step 11c (below) to assign a `shortcut_story_id` to every plan task.
4. Then proceed to step 12 (write plans) and create the Critic Review #3 task.

### 11c.1 — Delegate the Story Reconciler

Create a reconciler task: `task_create parent_id=<epic-id> type="agent-review" name="Story reconciliation" description="Reconcile catalog items with existing Shortcut stories under the epic." agent="story_reconciler"`.

Delegate it to a child session. In the delegation prompt, map the persona: for `agent="story_reconciler"`, read `.claude/agents/story-reconciler.md`. Give it the catalog artifact, **the specification artifact**, and the epic number. It needs the spec because it writes every new story's description, and the catalog names each item in about a line. It reads existing stories via the read-capable Shortcut MCP, classifies each catalog item (matched / needs-creation / ambiguous), lists extra stories, and writes a `story_reconciliation` proposal.

### 11c.2 — Human confirmation gate (not blind)

Read the proposal. Present it to the user:
- Confirm the **matched** items.
- Resolve each **ambiguous** item one at a time (match it to a story, or mark it needs-creation).
- Surface **extra stories** and let the user decide (out of scope, or loop back to the Architect to extend the catalog). Never modify or delete a Shortcut story.

### 11c.3 — Create missing stories, then link

For every item that is (or becomes) **needs-creation**:
- If `shortcut_write` is `enabled`: create the story under the epic with the title and description from the Reconciler's `## Stories to create` section, as written. Read back its number.
- If `shortcut_write` is `disabled`: present the exact list of stories to create, with the titles and descriptions from that same section. Create a gate task (type `human-review`, agent `user`) and wait. After the user says the stories exist, re-delegate the Story Reconciler to re-read Shortcut and re-match on those titles. Confirm the new matches with the user.

Then **link deterministically**: for each plan task, set its story number:
`task_update task_id=<plan-task-id> shortcut_story_id=<story#>`.

"Which items still need a story" is always the deterministic query: plan tasks whose `shortcut_story_id` is null. Do not leave 11c until every plan task has a number.

---

## Overlay 4 — Plans, Branch Names, and the Branch Plan (Step 12)

### 4.1 — Story types and the Branch Plan (you own this, it is deterministic)

Before writing plans, build a **Branch Plan**: one row per story with its branch name and base branch. You own this because it is deterministic and needs the whole dependency graph.

Branch name format: `<user>/<type>/sc-<story#>/<short-desc>`, **40 characters or fewer**.
- `<user>` — from `git config user.name` (or a `config` override if the user set one).
- `<type>` — one of feat, fix, refactor, perf, docs, style, test. The **Developer proposes** this per story in step 12. If the Developer does not propose one, **ask the user**.
- `<story#>` — the plan task's `shortcut_story_id`.
- `<short-desc>` — the catalog-item slug, **truncated** so the whole name fits 40 characters. Budget for the slug = 40 − len(user) − len(type) − len("sc-<n>") − 3 slashes.

Base branch: **always `master`** (the repo's default branch, `master` in `ion`). No story branches off another story's branch. A story that depends on another story's code waits until that dependency has **merged** (Overlay 5, merge gate), then branches off a freshly pulled `master` that already holds it. Stories never stack, so a merge never forces a rebase of a downstream branch.

### 4.2 — Write the plans

Delegate the Developer per plan task, as the base does at step 12, with two `mr-maps` additions in the Delegation Contract:
- **doc path** = `.maps/docs/<epic-slug>/plans/sc-<story#>_<slug>.md` (Overlay 2).
- **Emit a `## Branch` section** in the plan, holding: base branch, branch name, type, slug. Supply the Branch Plan row for this story so the section matches what the build loop will use. Ask the Developer to propose the `type` if the Branch Plan does not yet have one, then fold its choice back into the Branch Plan.

Sizing follows the logical-grouping rule, not the base catalog guidelines; see Overlay 7.

---

## Overlay 5 — Build and Test (adapts the base Per-Item Build Loop, Steps 15 to 19)

The base runs a per-item build loop on one `maps/<epic-slug>` work branch: build, reconcile, unit tests, triage, checkpoint commit, then the Code Review Loop (Step 17r), with the Question Ladder throughout. `mr-maps` inherits all of that, including the review loop, the Critic build-time rules, the Question Ladder, and Decided for You. It changes the branching, the testing, the wiring, and what happens after the review. There is no base integration test task (Steps 18 and 19); Cypress takes its place inside each story.

**Branches replace the work branch.** Each story builds on its own branch off a fresh `master`. Do not create `maps/<epic-slug>`.

**Task wiring (replaces the base wiring after Step 14).** Per story, create only: the `implement` task, its Step 15a task (blocked by `implement`), and the **merge gate** (`task_create type="human-review" agent="user" name="Merge gate: sc-<story#>"`, blocked by the Step 15a task). A story that depends on story A is blocked by **A's merge gate**. Do **not** chain stories through each other, as the base does. Overlay 10 adds the release gate and the edges for the final feature story and the cleanup story.

**The story hold.** Each story's merge gate is its **hold target**, in place of the base's next-item hold target. Every task you create for the story while its loop runs gets `blocker_add` onto the story's merge gate before you call `next_task` again: the unit test task (`Unit tests and Cypress: sc-<story#>`), triage and fix tasks, review rounds, ladder questions, the MR description task, and, for the final feature story, every Step 20 task. Create these tasks only when they are needed, as in the base. The base rules about never adding a `done` or `deferred` blocker apply.

**One story's loop at a time.** Do not start a story while another story's loop, through its MR description, is unfinished. After that point the other story is committed on its own branch, so switching branches is safe. Independent stories have open `implement` tasks from the start, so `next_task` can return one in the middle of another story's loop. When it does, do not start it: take the unfinished story's next open task instead (`task_list status="open"`). Only `implement` tasks named for a catalog item start a story. `Fix: ...`, `Review fixes: ...`, and `MR description: ...` tasks never do.

For each `implement` task, in dependency order:

1. **Start from a fresh `master`.** Every merge gate this story depends on is `done`. Check that the working tree is clean, ignoring `.maps/`; if it is not, stop and ask the user. Run `git fetch origin`, `git checkout master`, `git pull --ff-only`.
2. **Create the branch** from the Branch Plan: `git checkout -b <branch> master`. Record the item base for the review loop: `config_set key="item_base:<epic-id>:sc-<story#>" value="<master SHA>"`.
3. **Build the story's code (Step 15).** Delegate the Developer with this story's plan (`implementation_plan` for `sc-<story#>_<slug>.md`). Keep its agent ID. The Delegation Contract carries the release rule from Overlay 10.
3a. **Plan/code reconciliation (Step 15a).** As in the base. The Critic also checks the release rule: with the flag off, this branch changes no behavior a user or customer can see, apart from exceptions the user approved.
4. **Unit tests (Step 16).** Once Step 15a resolves, create `Unit tests and Cypress: sc-<story#>` (type `test`, agent `test_writer`), hold it, and delegate the Test Writer. Tests are **colocated** next to the source (for example jest `*.test.ts|tsx|js`; Go `*_test.go`). Code behind the flag is tested in both flag states. The build and test commands are **discovered at runtime** by the child, per stack. A MetaRouter repo may span several stacks (for example JavaScript/TypeScript services, React, Go). Name the stack in the Delegation Contract and let the child determine the commands from the repo.
5. **Cypress gate.** Run the relevant Cypress specs for this story (Overlay 6). All must pass.
6. **Triage / fix loop (Step 17)** on any unit or Cypress failure, as in the base, with a hard limit of 5 iterations per story.
7. **Commit** the story's code and tests on the branch, as a base checkpoint commit. Never commit a MAPS document; check that no staged path is under `.maps/`. The commit message references the story, for example `sc-40469: <summary>`.
8. **Code review loop (Step 17r).** As in the base, with the item base from step 2. Two additions: the Critic checks the release rule in every round, and the Test Writer reruns the affected Cypress specs, in both flag states, as well as the unit tests after each round's fixes.
9. **MR description.** Delegate the draft MR description (Overlay 9). For the final feature story, do this after Step 20 instead (Overlay 8).
10. **Merge gate.** Tell the user the branch is ready to push, review, and merge. Show the MR description draft, its proposed title, and the base's Decided for You list for this story. The gate task stays open until the user confirms the MR has merged to `master`.

**Open merge gates do not stop the loop.** When the next task is an open merge gate, ask the user whether that MR has merged. If it has, mark the gate `done` and continue. If not, build any other `implement` task whose blockers are all `done`, and ask about the gate again when that story reaches its own merge gate. A story that depends on an unmerged story waits. If no other story can build, wait at the gate for the user. The user may therefore have several open MRs at once, but never a stacked one.

No MAPS document is committed at any step, on a story branch or on `master`.

**File Tracker and Build Summaries apply unchanged here.** The base's mechanism (Step 15/16 context) carries across the per-story loop exactly as it does in stock `/maps`. Every story's Developer and Test Writer delegation includes the terse build summaries of every earlier story in this epic, regardless of which git branch it landed on.

**Boundary — local commits only.** `mr-maps` never pushes. The user controls `git push`, merge request creation, and merging. Do not run `git push`, open an MR, or merge one.

**Inherit `shortcut_story_id` onto implement tasks.** When you create `implement` tasks (after plans are approved, as the base does at step 14), copy each plan task's `shortcut_story_id` onto its `implement` task, so the loop reads the story number and Branch Plan row directly.

---

## Overlay 6 — Cypress (the regression backstop)

MetaRouter repos typically test with two tiers: colocated unit tests, and Cypress E2E specs (commonly under `cypress/`). There is usually no classic integration tier. **Discover the repo's actual test setup** (frameworks, folders, how to run them) rather than assuming. Where the repo has a UI covered by Cypress, Cypress is MetaRouter's most important tool for catching regressions, and the rules below apply. A repo with no UI or no Cypress runs the unit-test tier only.

**Where a spec runs.** A Cypress spec exercises a full vertical slice (UI plus backend plus DB), so it is written and run on its **last-enabling story**, the story that completes the slice. That branch must contain the whole slice, so the Cypress-carrying story is blocked by the merge gate of every story its spec needs. It then branches off a `master` that already holds them. Encode those edges at step 14, before building. No stacking and no throwaway integration branch is used.

**Which specs run on a branch, before its commit.** Run the set:
- every new or modified spec for this story, plus
- every existing spec whose exercised code touches files changed on this branch and that is runnable on the branch.

Selecting the affected existing specs is a **reasoning step** (specs do not statically import the backend). Delegate the Test Writer or Critic to map the branch's changed files to the UI flows they affect and pick those specs, always including new or modified specs, with a "when in doubt, include it" bias. In-session runs this targeted subset. CI runs the full Cypress suite after merge.

**Gate.** All selected specs must pass **before** the commit. Never commit, and never push, until the Cypress run has happened and passed. Failures use the same triage/fix loop with the 5-iteration cap, then ask the user.

**Coverage vigilance.** Any story behavior that can be validated through the UI must have a UI-driven Cypress spec, new or existing. Purely internal or backend changes with no UI surface stay unit-only. Surface borderline cases to the user.

**Flag states.** Every story's Cypress gate covers both states of the release flag (Overlay 10):
- **Flag off (the default).** The affected existing specs pass unchanged. This proves the branch is dark.
- **Flag on.** The story's new or modified specs pass with the flag on, through the repo's override helper (in `ion`, `cy.overrideFeatureFlags`).

The first story that declares the flag also registers it as off in the test harness, following the repo's convention (in `ion`, `UNRELEASED_FEATURE_FLAGS` in `cypress/support/commands.js`).

**UI-driven only (house rule).** The behavior under test is exercised and asserted through the UI (`cy.visit`, `cy.contains(...).click()`, `cy.get(...).type()`, assert on rendered DOM). No cURL, `cy.request`, or DB query may stand in for a user action or serve as the assertion. Setup, teardown, and auth via `cy.task('query', ...)`, `cy.login()`, and `cy.overrideFeatureFlags(...)` are allowed, matching existing house practice. Put this rule in the Test Writer's Delegation Contract and have the Critic check it.

**Running Cypress.** In-session Cypress needs the project's stack up. The commands to bring up the stack and run Cypress are discovered at runtime from the repo. Do not hardcode them.

---

## Overlay 7 — Story Sizing (Step 11)

**This overrides the base, for `mr-maps` only.** The base catalog guidelines set a numeric ceiling (under 30 logical production files, under 500 logical lines) for every other MAPS epic. `mr-maps` does not use it. Size each story to a **logical grouping** instead: a component, a package, a cohesive slice of the change.

**Why.** Each story is one full review round: an MR, a CI pipeline to watch to green, a colleague's review, and a merge gate. MetaRouter's pipelines are flaky enough that each run needs watching. Component-grouped stories mean fewer of these rounds per epic.

**Two failure directions.** Tell the Architect both, not just one:
- **Too few, too large.** One story per epic loses per-story review and produces one MR too large to review. A story must still be reviewable in one sitting.
- **Too many, too small.** Splitting by an arbitrary count multiplies review rounds, pipelines, and merge gates without making any one MR easier to review.

**The split/merge test.** Two pieces of work belong in the same story if they sit in the same component or package. Split only across a genuine architectural boundary (frontend vs backend, or across distinct packages or services), never by size. When in doubt, keep work together.

**Every story must be safe to merge alone.** With the flag off, `master` stays releasable after each story merges (Overlay 10). Do not split work so that one half breaks `master` until the other half merges.

**A component-grouped story can still hold UI and backend together.** That lets a Cypress spec run inside one story instead of waiting for other stories to merge first (Overlay 6), and grouping by component makes this the common case.

Split and merge proposals surface in the normal catalog and plan review (steps 11b, 13–14) for the user to approve. There is no commit-time gate.

**Legacy-path replacement.** When a story replaces a legacy path, its catalog item's Scope must note whether existing analytics or telemetry events need an equivalent on the new path, so parity is not dropped silently.

---

## Overlay 8 — Acceptance Verification (Step 20)

Keep the base Step 20 guarantee: every acceptance criterion is verified, and the Epic completes only when every AC task is `done`.

**Where Step 20 runs.** On the **final feature story's** branch, after its code review loop (Overlay 5, step 8) and before its MR description and merge gate. Overlay 10 makes that story wait until every other feature story has merged, so its branch is `master` plus the last story, which is the whole epic. Run Step 20 there **with the release flag on**.

**When Step 20 starts.** `mr-maps` has no base Step 19, so the base trigger "After Integration Tests Pass" never fires. Instead, when the final feature story's code review loop ends, materialize the AT and AC tasks as the base Step 20 setup describes. Add each AT and AC task as a blocker of the final feature story's merge gate (the story hold), so the merge gate cannot open before Step 20 is done.

**Epic completion (overrides the base).** Also block the Epic by the cleanup story's merge gate (Overlay 10). The epic completes only after the cleanup story merges, not when the last AC is `done`. At completion there is no `maps/<epic-slug>` work branch to report, so leave that line out of the base completion message.

**Fixes land in the final MR.** A Step 20 failure enters the base Step 20 fix loop (5 iterations) on this branch, even when the faulty code came from an earlier, already-merged story. Re-run the Cypress gate with the flag off and on after any fix, then make a checkpoint commit. Draft this story's MR description (Overlay 9) only after Step 20 completes, so its change list includes the Step 20 fixes.

A UI-facing criterion is not verified without a passing UI-driven Cypress spec behind it, run with the flag on. The Verifier delegation, confidence labels, and completion rule are inherited from the base. The cleanup story (Overlay 10) builds after Step 20, and its own gates keep the verified behavior intact.

---

## Overlay 9 — MR Description (per story, NEW)

`mr-maps` never opens an MR, so a draft description is its hand-off to the user. The spec and the plans are not committed (Overlay 2), so the description is all the context a reviewer gets. There is no separate review of the spec by colleagues. The user's own spec review at steps 6 to 10 stays.

**9.1 — Delegate the draft.** After the story's code review loop ends (Overlay 5, step 8), create a task (`type="implement"`, `agent="developer"`, `name="MR description: sc-<story#>"`) and delegate the Developer, on `sonnet`. Give it:
- the spec's Executive Summary;
- the epic sentence from the story's Shortcut description (written at 11c);
- the story's Shortcut title and number;
- the story's plan, and the Critic's reconciliation notes from step 3a;
- the story's code review log, for the findings the Developer declined;
- the branch diff, `git diff master...HEAD`;
- the release flag name, from the spec's `## Release Flag` section;
- the repo's MR template, for example `.gitlab/merge_request_templates/default.md`. The child finds it.

It writes the draft to the `doc path` from Overlay 2 and registers it as `mr_description`.

**9.2 — Format.** Fill the repo's MR template. Keep its headings and drop its HTML comments. For `ion` and `roost`, the draft looks like this:

```markdown
# Description, motivation, and context

[sc-<story#>](https://app.shortcut.com/metarouter/story/<story#>)

<The epic's purpose. Two sentences at most.>

<This MR's role in the epic. Two sentences at most.>

- <A change, as a reviewer sees it in the diff.>
- <Another change.>

# Known limitations, trade-offs, and technical debt

- <An item, with a link to the Shortcut story that tracks it.>
```

**9.3 — Rules.**
- **Epic purpose: two sentences at most.** Say what the epic achieves and why. Use the same text in every story of the epic. Leave out this paragraph when the story has no epic.
- **Role: two sentences at most.** Say what this MR adds to the epic. If the change is behind the release flag, name the flag here.
- **No exposition.** No background, no history, no description of the process that produced the code.
- **Changes: one bullet per change.** Describe what changed, not a list of files.
- **Known limitations.** Collect them from the plan, the build summaries, step 3a's notes, review findings the Developer declined that a reviewer would want to know about, Decided for You lines the user did not overrule, and release-flag exceptions. The repo template asks for a tracking story for each item. Use the story link when one exists. When none exists, mark the item `(needs a story)` so the user files one before opening the MR. Write `N/A` when there are no items.
- **Never cite MAPS documents or their IDs.** Reviewers cannot see the spec, the plans, or IDs such as AC-3 or D-2.
- **Title.** Propose an MR title in the repo's format, `type(scope): subject`. Take `type` from the Branch Plan.

---

## Overlay 10 — Release Flag (Steps 4, 11, 14, and after Step 20, NEW)

Every story merges to `master` dark. One release flag turns the feature on after the last feature story merges. This lets stories merge one at a time, with no stacking.

**The release rule.** After each story merges, `master` is safe to release with the flag off: no user or customer sees changed behavior.
- **Code that can read the flag** hides its new behavior behind it. The flag defaults to off in code, so an undeclared or unreachable flag stays off. In `ion`, only the front end can read flags (LaunchDarkly client SDK, declared in `packages/app/src/launch-darkly/featureFlags.js`).
- **Code that cannot read the flag** (migrations, Hasura metadata, backend services) must be **inert**: additive schema changes, new endpoints or queries that nothing calls yet, new permissions nothing uses yet.
- **Exceptions.** A change that cannot be inert, for example a changed default or a destructive migration, is an exception. The Architect records it as an open question in the spec, and the user decides at the base spec-review steps. The decision is recorded like any other answer.

**10.1 — Spec (step 4).** The Architect adds a `## Release Flag` section to the spec. It names the flag, following the repo's naming convention, and says what the flag hides. It lists each change that cannot read the flag and why that change is inert, or marks it as an exception. **One flag by default.** A second flag is allowed only for a part that must turn on or roll back separately, and the section must say why. The Critic checks this section at reviews #1 and #2.

**10.2 — Catalog (step 11).** The Architect adds a **cleanup story** as the last catalog item, "Retire `<flag>`". It removes the flag checks, the flag-off code path, the flag declaration, and the test-harness overrides, so the feature runs unconditionally. It goes through 11c, plans, and reviews like any other story. Critic Review #3 checks that every plan keeps `master` releasable with the flag off.

**10.3 — Gate wiring (step 14).** Besides the merge gates of Overlay 5:
- **Final feature story.** Pick the last feature story in dependency order. Block it by the merge gate of **every** other feature story, not only its dependencies, so its branch holds the whole epic for Step 20 (Overlay 8).
- **Release gate.** `task_create type="human-review" agent="user" name="Release gate: <flag>"`, blocked by the final feature story's merge gate.
- **Cleanup story.** Block its `implement` task by the release gate.

**10.4 — Release gate.** After the final feature story merges, tell the user the feature is ready to release. The user creates the flag in the flag service if it does not exist yet, turns it on, and watches it in production. The gate stays open until the user confirms the flag is on **and** the feature is stable. **Never change the flag service yourself.** Turning a flag on reaches production, so it stays with the user, like `git push`.

**10.5 — Cleanup story.** After the release gate, build the cleanup story through the normal Overlay 5 loop, off a fresh `master`. Its Cypress gate runs the epic's specs with no flag override, because the flag no longer exists in code. After its merge gate, remind the user to archive the flag in the flag service. The epic is done when its tasks are done.

---

## Overlay 11 — Intake and the Direct Path (Step 0)

The base Step 0 Intake and Direct Path apply, with these changes for a Direct change:

- **One story, no epic.** Before the build, get the story: if `shortcut_write` is `enabled`, ask the user whether to file it under an existing epic or none, then create it and read back its number. Otherwise ask the user for the story number. Record it on the `Direct change` task: `task_update task_id=<id> shortcut_story_id=<story#>`.
- **Branch.** The story's own branch replaces the base work branch. Name it as in Overlay 4.1, with the `type` the probe's change implies (ask the user if unclear). Create it as Overlay 5 steps 1 and 2 do, off a fresh `master`, and record the item base under `item_base:<epic-id>:sc-<story#>`. Record `start_branch:<epic-id>` as `master`. On escalation, check out `master` and rename the story branch with a `-direct` suffix, in place of `maps/<epic-slug>`. Escalating to Full then runs Overlay 1's Shortcut epic capture before the rest of the base setup.
- **Release flag.** A Direct change adds no behavior, so it has nothing to hide. Tell the scope probe to record this as a release-rule exception in its Risk signals section. Show that line in the Intake recommendation, so the user confirms the exception when choosing Direct.
- **Cypress.** The checks include the affected existing Cypress specs, selected by the Overlay 6 rule, run before the commit and again after each review round's fixes. A Direct change writes no new specs. If it needs one, it has new behavior, which is a risk signal.
- **Commit messages** reference the story, as in Overlay 5 step 7.
- **After the user review:** draft the MR description (Overlay 9). With no epic, leave out the epic paragraph. Create `MR description: sc-<story#>` and `Merge gate: sc-<story#>` (blocked by the MR description task), then run the merge gate as in Overlay 5 step 10. This replaces the base Direct path's "Done" step; mark the epic done after the merge gate.
- **Document paths:** the review log is `.maps/docs/<epic-slug>/reviews/code-review-sc-<story#>.md`.

---

## Delegation Contract Overlay (personas are unedited)

The eight base personas and the Story Reconciler are not edited. All `mr-maps` behavior reaches them through the Delegation Contract you build for each task. Add these to the base contract as relevant:

- **Every document task:** the `doc path` and `artifact_type` from Overlay 2. Never rely on a persona default path.
- **Architect at step 4:** the release rule and the `## Release Flag` section from Overlay 10.1, including the one-flag default and the exception path.
- **Critic at reviews #1 to #3:** check the release rule. At #1 and #2, check the `## Release Flag` section. At #3, check that every plan keeps `master` releasable with the flag off.
- **Architect at step 11:** the logical-grouping sizing rule, the safe-to-merge-alone rule, and the Cypress-slice point from Overlay 7, plus the cleanup story from Overlay 10.2. Also: **do NOT write Shortcut titles or descriptions into the catalog.** The Story Reconciler owns story text at 11c, and it has the spec to write it from. A catalog that carries story text duplicates work that has not happened yet and makes the catalog the longest document in the chain.
- **Story Reconciler at step 11c:** map `agent="story_reconciler"` to `.claude/agents/story-reconciler.md`. Give it the catalog, the specification, and the epic number. It writes every new story's title and description. A description stands alone with no link to the spec, and makes three moves: one sentence naming the epic (identical in every story, compressed from the spec's Executive Summary), then why this story exists in terms of what the epic needs, then what it does.
- **Developer at step 12:** emit a `## Branch` section from the Branch Plan row, and propose the `type` if missing.
- **Developer at build (Overlay 5):** name the stack; build and test commands are runtime-discovered. Give it the release rule and the flag name from the spec's `## Release Flag` section.
- **Critic at plan/code reconciliation (Overlay 5, step 3a):** also check the release rule against the built code.
- **Critic at each code review round (Overlay 5, step 8):** also check the release rule against the story's diff.
- **Test Writer after a review round's fixes (Overlay 5, step 8):** rerun the unit tests and the affected Cypress specs in both flag states.
- **Test Writer (unit):** colocate tests per stack; commands runtime-discovered. Test code behind the flag in both flag states.
- **Test Writer / Critic (Cypress):** the affected-spec selection rule, the flag-states rule, the UI-driven house rule, and coverage vigilance from Overlay 6.
- **Developer at the MR description (Overlay 9):** the inputs from 9.1, the format from 9.2, and the rules from 9.3.

## Model Routing Overlay

Base model routing applies unchanged. Read the base `Model Routing` section and the `Model` column of the base Context Curation Table. Two `mr-maps` steps are not in the base table:

| Step | Agent | Model | Why |
|------|-------|-------|-----|
| 11c | Story Reconciler | sonnet | Matches catalog items to existing stories. Classification, not design. |
| Overlay 5 loop | Developer (build), Critic (plan/code reconciliation), Test Writer (unit + Cypress), Critic (triage), Reviser | sonnet | Same work as base steps 15-19, which route to `sonnet`. |
| Overlay 9 | Developer (MR description) | sonnet | Summarizes a finished diff. No design work. |

The Architect at step 11, the Critic at reviews #1 to #3, the LLM Security Auditor, the Developer at step 12, and the Verifier at Step 20 all stay on `opus`, as in the base.

## Inherited Unchanged (do not re-implement)

Follow the base `maps.md` for all of these:
- Session delegation model, the main loop, context curation, model routing, the file tracker.
- Human review: collect inline, record via a child session.
- Critical review loops (3 iterations). Conditional LLM security review (2 iterations, skips when disabled).
- Checkpoint commits, the Code Review Loop (Step 17r), the Critic build-time rules, the Question Ladder, and Decided for You, adapted per story by Overlay 5.
- Crash recovery, loop iteration tracking, error handling, one-child-at-a-time, forward-only status, epic scoping.

## Starting the Workflow

```
User: "/mr-maps <problem statement for a Shortcut epic>"

You:
1. Read .claude/commands/maps.md (your base).
2. Detect Shortcut write capability, record shortcut_write.
3. Run the base setup through Step 0 Intake (epic task, current_epic_id, project_init, the code review skill check, Intake), keeping .maps/ out of git (Overlay 1).
4. Direct: follow the base Direct Path with Overlay 11. Nothing: stop.
5. Full: capture the Shortcut epic number, record shortcut_epic_number, then finish the base setup (LLM-security question, research chain).
6. Follow the base workflow, applying the overlays above at steps 1, 4, 10, 11, 11c, 12, 14, 15–20, and the release gate and cleanup story after Step 20.
```

Now begin, based on the user's problem statement.
