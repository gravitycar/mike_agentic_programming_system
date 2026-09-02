# mr-maps - MetaRouter / Shortcut Variant of MAPS

You are executing the `/mr-maps` command ("Mister Maps"), the MetaRouter variant of `/maps`. It runs the same spec-driven workflow, adapted to MetaRouter repositories, the Shortcut epic/story model, and MetaRouter's git and testing discipline. It works in any MetaRouter GitLab or GitHub repo. Discover each repo's actual conventions at runtime rather than assuming one project's layout.

## How to Read This Command

Your base workflow is the stock `/maps` command at `.claude/commands/maps.md`. **Read that file first and follow it**, except where this overlay changes it. On every point this overlay addresses, this overlay is authoritative and supersedes the base.

This overlay does not repeat the base. It changes five areas:
1. Document paths (where files live and what is committed).
2. Shortcut epic and story numbers, plus a new Story Reconciler step (11b).
3. Git branches (one story, one branch) and a restructured per-story build loop.
4. Testing (unit plus Cypress, no classic integration tier).
5. Story sizing (the 30-file / 500-logical-line budget).

Everything else is inherited unchanged from the base: the session-delegation model, critical review loops (3 iterations), the conditional LLM security review, human-review recording via a child, crash recovery, loop tracking, and error handling. The reference spec is `docs/specs/10-mr-maps.md`.

## Environment and Prerequisites

- `/mr-maps` runs inside a MetaRouter repository (any MetaRouter GitLab or GitHub repo). All paths below are relative to the repo root.
- It needs the Shortcut MCP server. A **read-capable** Shortcut MCP is required. A **write-capable** one is optional and enables auto-creation of the epic and stories. Find Shortcut tools with ToolSearch.
- **Detect write capability once, at start.** Search for a Shortcut create-story tool. Record the result: `config_set key="shortcut_write" value="enabled"` or `value="disabled"`. This drives the read-only fallback later.

## Terminology Map

- **Shortcut epic** = the MAPS epic = the step-1 problem statement.
- **Shortcut story** = one catalog item = one implementation plan = one `implement` task = one git branch.
- There is no new "story" task type. A story is represented by its `plan` and `implement` tasks, which carry its Shortcut number in the `shortcut_story_id` column.

---

## Overlay 1 — Initial Setup (Step 1)

Follow the base "Initial Setup", with these additions.

**Capture the Shortcut epic number.** The epic directory and every branch name need it.
- If `shortcut_write` is `enabled` and the epic does not yet exist, create it in Shortcut and read back its number.
- Otherwise, ask the user for the Shortcut epic number, or ask them to create the epic in Shortcut and give you the number.
- Record it: `config_set key="shortcut_epic_number" value="<n>"`.

**project_init still runs.** It creates `.maps/` and `.maps/maps.db` as in the base. Internal MAPS artifacts still live under `.maps/`. Only the committed documents move (see Overlay 2).

The rest of setup (epic task, `current_epic_id`, the LLM-security question, the initial research chain) is unchanged.

---

## Overlay 2 — Document Paths (supersedes the base "Output Paths" table)

Documents have two homes, split by whether they are a MetaRouter deliverable or internal scaffolding.

**Committed to git**, flat under `docs/plans/sc-<epic#>/`:
- the epic specification, `<spec-name>.md`;
- each story plan, `sc-<story#>_<slug>.md`.

**Internal, kept under `.maps/`** (gitignored): research, the implementation catalog, critical reviews, the story-reconciliation proposal, test-result logs, security-audit reports.

Use this table in every Delegation Contract in place of the base "Output Paths" table. `<epic#>` is the Shortcut epic number from config. `<story#>` is the plan task's `shortcut_story_id`. `<slug>` is the lowercase kebab-case slug of the catalog item name.

| Step | Agent | doc path | artifact_type |
|------|-------|----------|---------------|
| 2 | Researcher (codebase) | `.maps/docs/<epic-slug>/research/codebase-summary.md` | `codebase_summary` |
| 3 | Researcher (web) | `.maps/docs/<epic-slug>/research/web-research.md` | `web_research` |
| 4 | Architect (spec) | `docs/plans/sc-<epic#>/<spec-name>.md` | `specification` |
| 11 | Architect (catalog) | `.maps/docs/<epic-slug>/catalog/implementation-catalog.md` | `catalog` |
| 11b | Story Reconciler | `.maps/docs/<epic-slug>/reconciliation/story-reconciliation.md` | `story_reconciliation` |
| 12 | Developer (plan) | `docs/plans/sc-<epic#>/sc-<story#>_<slug>.md` | `implementation_plan` |

Rules:
- Always pass an explicit `doc path` in the Delegation Contract. Never let a persona fall back to its stock `.maps/docs/...` default. The persona default is wrong for committed documents in `mr-maps`.
- Register every document with its real path. The artifacts table stays the source of truth for lookup, so the split home is transparent to every agent.
- The `<spec-name>` is a short kebab-case name for the spec, for example `audit-log-triggers.md`. Choose it once at step 4 and reuse it.

---

## Overlay 3 — Shortcut Story Numbers and the Story Reconciler (Step 11b, NEW)

This step sits between catalog approval (step 11) and plan writing (step 12). Its job is to give every catalog item a real Shortcut story number, without creating duplicates.

**Order of operations changes slightly from the base.** In the base, plan tasks are created right after the catalog and then written. In `mr-maps`:
1. After the catalog is approved, create one `plan` task per catalog item (type `plan`, agent `developer`), with blockers from the catalog's "blocked by" notes, exactly as the base does. Do **not** write the plans yet, and do not create the Critic Review #3 task yet.
2. Run Step 11b (below) to assign a `shortcut_story_id` to every plan task.
3. Then proceed to step 12 (write plans) and create the Critic Review #3 task.

### 11b.1 — Delegate the Story Reconciler

Create a reconciler task: `task_create parent_id=<epic-id> type="agent-review" name="Story reconciliation" description="Reconcile catalog items with existing Shortcut stories under the epic." agent="story_reconciler"`.

Delegate it to a child session. In the delegation prompt, map the persona: for `agent="story_reconciler"`, read `.claude/agents/story-reconciler.md`. Give it the catalog artifact and the epic number. It reads existing stories via the read-capable Shortcut MCP, classifies each catalog item (matched / needs-creation / ambiguous), lists extra stories, and writes a `story_reconciliation` proposal.

### 11b.2 — Human confirmation gate (not blind)

Read the proposal. Present it to the user:
- Confirm the **matched** items.
- Resolve each **ambiguous** item one at a time (match it to a story, or mark it needs-creation).
- Surface **extra stories** and let the user decide (out of scope, or loop back to the Architect to extend the catalog). Never modify or delete a Shortcut story.

### 11b.3 — Create missing stories, then link

For every item that is (or becomes) **needs-creation**:
- If `shortcut_write` is `enabled`: create the story under the epic with the Reconciler's proposed title and description. Read back its number.
- If `shortcut_write` is `disabled`: present the exact list of stories to create (proposed titles and descriptions). Create a gate task (type `human-review`, agent `user`) and wait. After the user says the stories exist, re-delegate the Story Reconciler to re-read Shortcut and re-match on the proposed titles. Confirm the new matches with the user.

Then **link deterministically**: for each plan task, set its story number:
`task_update task_id=<plan-task-id> shortcut_story_id=<story#>`.

"Which items still need a story" is always the deterministic query: plan tasks whose `shortcut_story_id` is null. Do not leave 11b until every plan task has a number.

---

## Overlay 4 — Plans, Branch Names, and the Branch Plan (Step 12)

### 4.1 — Story types and the Branch Plan (you own this, it is deterministic)

Before writing plans, build a **Branch Plan**: one row per story with its branch name and base branch. You own this because it is deterministic and needs the whole dependency graph.

Branch name format: `<user>/<type>/sc-<story#>/<short-desc>`, **40 characters or fewer**.
- `<user>` — from `git config user.name` (or a `config` override if the user set one).
- `<type>` — one of feat, fix, refactor, perf, docs, style, test. The **Developer proposes** this per story in step 12. If the Developer does not propose one, **ask the user**.
- `<story#>` — the plan task's `shortcut_story_id`.
- `<short-desc>` — the catalog-item slug, **truncated** so the whole name fits 40 characters. Budget for the slug = 40 − len(user) − len(type) − len("sc-<n>") − 3 slashes.

Base branch (the stacking rule), read from the blocker graph:
- A story with no story dependency → base `master`.
- A story that depends on another story's code → base = that dependency's branch (stacked). The dependency is not merged yet, so `master` lacks its code.
- If a Cypress spec needs several independent stories at once, linearize them into a stack so one branch holds the whole slice (see Overlay 6). Encode that as blocker edges before building.

### 4.2 — Write the plans

Delegate the Developer per plan task, as the base does at step 12, with two `mr-maps` additions in the Delegation Contract:
- **doc path** = `docs/plans/sc-<epic#>/sc-<story#>_<slug>.md` (Overlay 2).
- **Emit a `## Branch` section** in the plan, holding: base branch, branch name, type, slug. Supply the Branch Plan row for this story so the section matches what the build loop will use. Ask the Developer to propose the `type` if the Branch Plan does not yet have one, then fold its choice back into the Branch Plan.

Also inject the sizing note (Overlay 7) at step 11 so plans arrive within budget.

---

## Overlay 5 — Build and Test (supersedes base steps 15–19)

Replace the base "build everything, then unit-test, then integration-test" phase with a **per-story build loop**. Build stories in dependency order. Process one story fully before the next. One child at a time, as always.

For each `implement` task, in dependency order:

1. **Checkout / create the branch** from the Branch Plan: `git checkout -b <branch> <base>`. The base is `master` or the dependency's branch.
2. **Build the story's code.** Delegate the Developer with this story's plan (`implementation_plan` for `sc-<story#>_<slug>.md`).
3. **Unit tests.** Delegate the Test Writer. Tests are **colocated** next to the source (for example jest `*.test.ts|tsx|js`; Go `*_test.go`). The build and test commands are **discovered at runtime** by the child, per stack. A MetaRouter repo may span several stacks (for example JavaScript/TypeScript services, React, Go). Name the stack in the Delegation Contract and let the child determine the commands from the repo.
4. **Cypress gate.** Run the relevant Cypress specs for this story (Overlay 6). All must pass.
5. **Triage / fix loop** on any unit or Cypress failure. Same as the base steps 17/19: delegate Critic triage, route CODE / TEST / BOTH, undo code before rebuild (`git checkout` modified files, delete new files), retest. **Hard limit 5 iterations**, then stop and ask the user.
6. **Commit** code and tests on the branch. The commit message references the story, for example `sc-40469: <summary>`.

**Committing epic-level documents.** Epics have no branch, and the spec was approved (step 10) but not committed. Commit it now, on the **first** story branch created in this loop, as a small docs commit ahead of that story's code. Each story **plan file** is committed on **its own** story branch. Do not commit documents to `master` directly.

**Boundary — local commits only.** `mr-maps` never pushes. The user controls `git push` and merge request creation. Do not run `git push` or open an MR.

**Inherit `shortcut_story_id` onto implement tasks.** When you create `implement` tasks (after plans are approved, as the base does at step 14), copy each plan task's `shortcut_story_id` onto its `implement` task, so the loop reads the story number and Branch Plan row directly.

---

## Overlay 6 — Cypress (the regression backstop)

MetaRouter repos typically test with two tiers: colocated unit tests, and Cypress E2E specs (commonly under `cypress/`). There is usually no classic integration tier. **Discover the repo's actual test setup** (frameworks, folders, how to run them) rather than assuming. Where the repo has a UI covered by Cypress, Cypress is MetaRouter's most important tool for catching regressions, and the rules below apply. A repo with no UI or no Cypress runs the unit-test tier only.

**Where a spec runs.** A Cypress spec exercises a full vertical slice (UI plus backend plus DB), so it is written and run on its **last-enabling story**, the story that completes the slice. For that branch to run and commit the spec green, it must contain the whole slice, so the Cypress-carrying story stacks (transitively) on every story its spec needs. If those stories are independent, linearize them into a stack (Overlay 4.1). No throwaway integration branch is used.

**Which specs run on a branch, before its commit.** Run the set:
- every new or modified spec for this story, plus
- every existing spec whose exercised code touches files changed on this branch and that is runnable on the branch.

Selecting the affected existing specs is a **reasoning step** (specs do not statically import the backend). Delegate the Test Writer or Critic to map the branch's changed files to the UI flows they affect and pick those specs, always including new or modified specs, with a "when in doubt, include it" bias. In-session runs this targeted subset. CI runs the full Cypress suite after merge.

**Gate.** All selected specs must pass **before** the commit. Never commit, and never push, until the Cypress run has happened and passed. Failures use the same triage/fix loop with the 5-iteration cap, then ask the user.

**Coverage vigilance.** Any story behavior that can be validated through the UI must have a UI-driven Cypress spec, new or existing. Purely internal or backend changes with no UI surface stay unit-only. Surface borderline cases to the user.

**UI-driven only (house rule).** The behavior under test is exercised and asserted through the UI (`cy.visit`, `cy.contains(...).click()`, `cy.get(...).type()`, assert on rendered DOM). No cURL, `cy.request`, or DB query may stand in for a user action or serve as the assertion. Setup, teardown, and auth via `cy.task('query', ...)`, `cy.login()`, and `cy.overrideFeatureFlags(...)` are allowed, matching existing house practice. Put this rule in the Test Writer's Delegation Contract and have the Critic check it.

**Running Cypress.** In-session Cypress needs the project's stack up. The commands to bring up the stack and run Cypress are discovered at runtime from the repo. Do not hardcode them.

---

## Overlay 7 — Story Sizing (Step 11)

The 30-file / 500-line budget is a **soft** guideline, checked once, at catalog sizing (step 11), by the Architect. There is no commit-time gate.

Inject this into the step-11 Delegation Contract for the Architect:
- Size each catalog item as one Shortcut story. This **overrides** the stock "~3 files per catalog item" guidance.
- Target fewer than **30 logical/production files** and fewer than **500 logical lines**. Exclude comments, blank lines, markdown, boilerplate, generated files, and all test files (unit and Cypress) from both counts.
- These are plan-time estimates. When an item would exceed the budget, propose splitting it into two or more stories.

Split proposals surface in the normal catalog and plan review (steps 13–14) for the user to approve.

---

## Overlay 8 — Acceptance Verification (Step 20)

Keep the base Step 20 guarantee: every acceptance criterion is verified, and the Epic completes only when every AC task is `done`. One `mr-maps` clarification:

The evidence is spread across unmerged story branches, and no single branch holds all of it. That is fine. By construction, every criterion's evidence already exists on some branch after the build loop:
- a UI-facing criterion is backed by its Cypress spec, green on its last-enabling branch;
- a backend or internal criterion is backed by its unit tests, green on its story branch.

The Cypress stacking rule guarantees any cross-story spec already ran green on a branch holding the whole slice. So Step 20 is a **per-criterion roll-up** over evidence already produced. Materialize the AT → AC → Epic chain, confirm each AC against its branch-local evidence, and re-run nothing across branches. A UI-facing criterion is not verified without a passing UI-driven Cypress spec behind it. The Verifier delegation, confidence labels, and completion rule are inherited from the base.

---

## Delegation Contract Overlay (personas are unedited)

The eight base personas and the Story Reconciler are not edited. All `mr-maps` behavior reaches them through the Delegation Contract you build for each task. Add these to the base contract as relevant:

- **Every document task:** the `doc path` and `artifact_type` from Overlay 2. Never rely on a persona default path.
- **Architect at step 11:** the sizing note from Overlay 7.
- **Story Reconciler at step 11b:** map `agent="story_reconciler"` to `.claude/agents/story-reconciler.md`. Give it the catalog and the epic number.
- **Developer at step 12:** emit a `## Branch` section from the Branch Plan row, and propose the `type` if missing.
- **Developer at build (Overlay 5):** name the stack; build and test commands are runtime-discovered.
- **Test Writer (unit):** colocate tests per stack; commands runtime-discovered.
- **Test Writer / Critic (Cypress):** the affected-spec selection rule, the UI-driven house rule, and coverage vigilance from Overlay 6.

## Inherited Unchanged (do not re-implement)

Follow the base `maps.md` for all of these:
- Session delegation model, the main loop, context curation, the file tracker.
- Human review: collect inline, record via a child session.
- Critical review loops (3 iterations). Conditional LLM security review (2 iterations, skips when disabled).
- Crash recovery, loop iteration tracking, error handling, one-child-at-a-time, forward-only status, epic scoping.

## Starting the Workflow

```
User: "/mr-maps <problem statement for a Shortcut epic>"

You:
1. Read .claude/commands/maps.md (your base).
2. Detect Shortcut write capability, record shortcut_write.
3. Capture the Shortcut epic number, record shortcut_epic_number.
4. Run the base setup (epic task, current_epic_id, project_init, LLM-security question, research chain).
5. Follow the base workflow, applying the overlays above at steps 1, 11, 11b, 12, 15–20.
```

Now begin, based on the user's problem statement.
