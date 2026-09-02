# MAPS Specification: `mr-maps` (MetaRouter / Shortcut Variant)

## Status: Draft

## Overview
`mr-maps` (pronounced "Mister Maps") is a third Claude Code custom command — a variant of `/maps` adapted to **MetaRouter repositories, the Shortcut workflow, and MetaRouter's git discipline**. It targets any MetaRouter GitLab or GitHub repo, not one project. It runs the same spec-driven pipeline as full `/maps` but changes four things to fit MetaRouter's environment: where documents live, how work maps onto Shortcut epics/stories, how code is branched and committed, and how it is tested (unit + Cypress, no classic integration tier). The `ion` repo is the reference used to validate these conventions.

`mr-maps` is a **separate command**, not a flag on `/maps` and not a modification of it. Stock `/maps` is left untouched. Everything MetaRouter-specific lives in a new command file plus one new persona; the only shared-infrastructure change is a single additive, backward-compatible database column. This is possible because the MCP server never constructs document paths (it stores whatever `file_path` string it is given) and git is entirely orchestrator-driven — so paths and branching are the orchestrator's concern, expressed in the command and its delegation contracts, not in the personas or the server.

## Context
`mr-maps` sits in the same two-layer model established by [05-orchestrator.md](05-orchestrator.md):
- The **workflow** below is the MetaRouter analog of [07-workflow.md](07-workflow.md) — the same 20 steps, with a new sub-step (11b) and a restructured build/test phase.
- The **orchestrator** (the `mr-maps` command + Claude Code) executes those steps.
- The **agent personas** ([04-agents.md](04-agents.md)) are reused **unchanged**; every MetaRouter-specific behavior is delivered through the delegation contract, exactly as stock `/maps` already overrides persona default paths. One **new** persona — the Story Reconciler — is added; the existing eight are not edited.

MetaRouter conventions this spec is built on (validated against the `ion` repo as the reference; they apply to any MetaRouter repo, whose specifics `mr-maps` discovers at runtime):
- **Shortcut** tracks work as epics and stories. Branch rule (each MetaRouter repo documents it, e.g. `ion/packages/CLAUDE.md`): `<user>/<type>/sc-<number>/<short-desc>`, **≤40 characters**, `type` ∈ {`feat`, `fix`, `refactor`, `perf`, `docs`, `style`, `test`}. **One story ↔ one branch**, strictly. Epics do not get branches.
- Guideline (soft): keep a branch's diff under **30 changed files and 500 changed lines**.
- Existing documentation convention: one **flat** directory per epic, e.g. `docs/plans/sc-40464/`, holding the epic spec and one plan file per story named `sc-<story#>_<slug>.md`, each plan carrying a `## Branch` section.
- Testing has exactly **two tiers**: colocated **unit tests** (jest `*.test.ts|tsx|js`; Go `*_test.go`) and **Cypress E2E** specs in `cypress/integration/`. There is no classic service-level integration tier; "integration test" at MetaRouter means Cypress.

## Guiding Principles
1. **Don't fork `/maps`; overlay it.** Same infrastructure, same personas, same acceptance-verification machinery. MetaRouter behavior is an overlay carried by the command and its delegation contracts.
2. **One story, one plan, one branch.** MAPS already decomposes an epic into catalog items → one implementation plan each → one `implement` task each, built sequentially in dependency order. MetaRouter's grain is a 1:1 overlay on that.
3. **Determinism where it counts.** Semantic matching (catalog item ↔ Shortcut story) is delegated to a persona; the *result* is recorded deterministically in the database. Path and branch-name construction is deterministic and command-owned.
4. **Cypress is the regression backstop.** Cypress specs are MetaRouter's most important tool for catching regressions; coverage of UI-validatable behavior is non-negotiable, and no commit is made until the relevant Cypress specs pass.
5. **MAPS proposes; the human controls git's outward edge.** `mr-maps` creates branches and local commits; pushing and MR creation stay with the user.

## When to Use `mr-maps`
Use `mr-maps` for feature-scale work in a MetaRouter repo that will land as **one or more Shortcut stories**, each its own branch/MR. For a genuinely small one-or-two-file fix, `/maps-lite` remains the right tool (a MetaRouter-flavored `mr-maps-lite` is out of scope for this spec). Routing is a user decision at invocation.

## Relationship to Stock `/maps` (Separation)
The separation is near-total:
- **New:** `.claude/commands/mr-maps.md`; `.claude/agents/story-reconciler.md`.
- **Shared, changed once:** a nullable `shortcut_story_id` column on `tasks` (additive; stock `/maps` never sets it and ignores it — see [Shortcut Integration](#shortcut-integration-and-the-story-reconciler)).
- **Unchanged:** the MCP server's 16 tools, the compressor, the database otherwise, and all eight existing personas. Stock `/maps` and `/maps-lite` behave exactly as before.

## Workflow
The 20-step workflow of [07-workflow.md](07-workflow.md) is preserved. The deltas:

- **Step 1 (User + Orchestrator) — capture the Shortcut epic.** The user describes the problem (the epic). The orchestrator obtains the epic's Shortcut number and records it: `config_set key="shortcut_epic_number" value="<n>"`. If a **write-capable** Shortcut MCP is available and the epic does not yet exist, the orchestrator creates it; otherwise the user creates the epic in Shortcut and supplies the number. The epic number determines the document directory (`docs/plans/sc-<n>/`).
- **Steps 2–10 — unchanged in behavior, changed in storage.** Research goes to `.maps/` (internal). The specification is authored at step 4 and stored at `docs/plans/sc-<n>/<spec-name>.md`. Critical reviews stay in `.maps/`. **Spec sign-off (step 10):** the spec is approved and written to disk but not yet committed, because epics have no branch and no story branch exists yet; the commit is deferred to the build loop (see [Committing epic-level documents](#committing-epic-level-documents)).
- **Steps 10a–d / 14a–d (LLM Security Auditor) — unchanged, conditional.** MetaRouter repos are generally not LLM-integrated, so these usually skip, exactly as in stock `/maps`.
- **Step 11 (Architect) — build catalog, sized to the story budget.** Each catalog item is sized as one Shortcut story (see [Story Sizing](#story-sizing-guideline)), overriding stock's "~3 files per item."
- **Step 11b (Story Reconciler) — NEW.** Reconcile catalog items against existing Shortcut stories under the epic; obtain a story number for every item. See [Shortcut Integration](#shortcut-integration-and-the-story-reconciler).
- **Step 12 (Developer) — write plans, one per story.** Each plan is stored at `docs/plans/sc-<n>/sc-<story#>_<slug>.md` and carries a `## Branch` section (base branch, branch name, type, slug). See [Git Branch Strategy](#git-branch-strategy).
- **Steps 13–14 — unchanged.** Critic review #3 + user resolution. Story-split proposals from sizing surface here for approval.
- **Steps 15–19 — RESTRUCTURED into the per-story build loop.** Instead of "build everything, then unit-test, then integration-test," each story is built, tested, and committed on its own branch. See [Git Branch Strategy](#git-branch-strategy) and [Testing Model](#testing-model).
- **Step 20 (Verifier), unchanged in guarantee.** Every acceptance criterion is verified. **UI-validatable criteria must be backed by a passing UI-driven Cypress spec.** The evidence lives on separate story branches, so Step 20 is a per-criterion roll-up (see [Acceptance verification across branches](#acceptance-verification-across-branches)).

## Document Storage
Two homes, split by whether the document is a MetaRouter deliverable or MAPS's internal scaffolding:

- **Committed to git**, under `docs/plans/sc-<epic#>/` (flat, matching the existing `sc-40464/` convention):
  - the epic **specification**, `<spec-name>.md`;
  - each **story plan**, `sc-<story#>_<slug>.md`.
- **Internal, kept in `.maps/`** (gitignored): research summaries, the implementation **catalog**, critical reviews, test-result logs, security-audit reports.

Mechanics (no persona change, no server change):
- The MCP server stores `file_path` verbatim; document lookup is via the `artifacts` table, so a split home is transparent — each document is findable at its registered path regardless of tree.
- The `mr-maps` command supplies **explicit input and output paths in every delegation contract**, so no persona ever falls back to its stock `.maps/docs/<epic-slug>/...` default. Relying on the persona default is prohibited in `mr-maps`.

## Shortcut Integration and the Story Reconciler
Both the document directory (`sc-<epic#>`) and every branch name (`sc-<story#>`) need real Shortcut numbers. The epic number is captured at step 1. Story numbers are assigned at **step 11b**, after the catalog is approved (never at first draft — so cut/merged items don't leave orphaned stories).

### Deterministic linkage
A nullable **`shortcut_story_id`** column is added to the `tasks` table. It is the authoritative catalog-item ↔ story link, anchored on the `plan` task (which is the database's representation of a catalog item — items are not rows until plan tasks are created). "This item still needs a story" is then a deterministic query: *plan tasks with `shortcut_story_id IS NULL`.* The column is additive and backward-compatible; stock `/maps` leaves it NULL and never reads it. No story-side key (external ID / label) is written in v1.

### The Story Reconciler persona (new, advisory)
Following MAPS's rule that personas *reason* and the orchestrator *does side effects* (as the Reviser never touches git), the Story Reconciler is **advisory** — it reads and proposes; the command executes.

- **Inputs:** the approved implementation catalog (from `.maps/`) + the current stories under the Shortcut epic, read via the **read-capable** Shortcut MCP (always available).
- **Output:** one classification per catalog item —
  - **matched** → an existing `sc-X` (with rationale),
  - **needs-creation** → no existing story; proposes a canonical title, description, and branch `type`,
  - plus a list of **extra** stories that match no catalog item.
- It never creates, edits, or deletes anything in Shortcut.

This directly covers the three epic states: empty epic → all items "needs-creation"; partially populated → a mix (no duplicates created); fully and correctly populated → all "matched," nothing created.

### Human gate and execution
- The proposal is **confirmed by the user** before anything is created (ambiguous matches resolved one at a time, MAPS-style). Not blind automation.
- **Extra / overlapping stories are never auto-modified** — surfaced for the user to decide (out of scope → leave it; or a sign the catalog missed something → loop back to the Architect).
- **Creation, gated on write access:**
  - **Write-capable Shortcut MCP present:** after confirmation, the command creates the "needs-creation" stories under the epic, re-reads to get their IDs, and links them (writes `shortcut_story_id` on the plan tasks).
  - **Read-only only:** the command emits a precise "create these in Shortcut" list (the Reconciler's canonical titles/descriptions) and **waits at a gate task**. The user creates the stories manually; on confirmation the command re-reads the epic, the Reconciler re-matches the now-existing stories, the user confirms, and the command links.
- Linking never depends on *who* created the story — it always flows read Shortcut → match → write `shortcut_story_id`. The same read/create duality applies to the **epic** at step 1.

## Git Branch Strategy
The build phase changes from "one working tree, no branches, one spec commit" to **one branch per story**.

### Branch naming — deterministic, with one semantic field
Format `<user>/<type>/sc-<story#>/<short-desc>`, enforced **≤40 characters** (e.g. `mike/feat/sc-40469/schemas-crud` = 31 chars). Of the four parts:
- **`user`** — from `git config user.name` (or a `config` override). Deterministic.
- **`sc-<story#>`** — from the plan task's `shortcut_story_id`. Deterministic.
- **`short-desc`** — kebab slug of the catalog-item name, **truncated to fit the 40-char budget** (budget = 40 − len(user) − len(type) − len(`sc-<n>`) − 3 slashes). Command-computed. Deterministic.
- **`type`** ∈ {feat,fix,refactor,perf,docs,style,test} — semantic. The **Developer proposes** it from the story's nature; **if the Developer does not propose one, the orchestrator asks the user.**

Delivery without a persona edit: the **step-12 delegation contract instructs the Developer to emit a `## Branch` section** into each plan (base branch, branch name, type, slug), matching the section the real `sc-40469` plan already carries. The command supplies the deterministic parts and enforces the length cap.

### Base branch and stacking
Build in dependency order (as MAPS already does). Base branch:
- **Independent story** → branch off `master`.
- **Dependent story B (needs A)** → branch off **A's branch** (stacked), because A is not yet merged, so `master` lacks A's code. This is exactly the reasoning the real `sc-40469` plan records ("base off `master` once sc-40466 has merged, otherwise branch off `mike/feat/sc-40466/...`, then rebase onto `master` after it lands"). The `## Branch` section records the base so reviewers diff correctly and the user knows what to rebase post-merge.

Stacking also preserves MAPS's "each child sees prior code" invariant: a stacked child inherits its dependency's code; independent children correctly do not see one another.

### The per-story build loop (replaces steps 15–19)
For each `implement` task, in dependency order:
1. **Create the branch** off (`master` | the dependency's branch).
2. **Build** the story's code (Developer).
3. **Unit tests** — write + run, **colocated** per stack (jest next to source; Go `*_test.go`) (Test Writer).
4. **Cypress gate** — run the relevant Cypress specs; all must pass (see [Testing Model](#testing-model)).
5. **Triage/fix loop** on any failure — Critic → Reviser / Developer / Test Writer → retest. Hard limit: **5 iterations**, then stop and ask the user.
6. **Commit** code + tests on the branch (commit message references `sc-<story#>`).

Code-undo before rebuild (`git checkout` + delete new files) applies within the loop, scoped to the branch, as in stock `/maps`.

### Committing epic-level documents
Epics have no branch, and the spec is signed off (step 10) before any story branch exists (created in the build loop, step 15). So epic-level docs are committed **on story branches**, deferred from sign-off:
- Each **story plan file** (`sc-<story#>_<slug>.md`) is committed on **its own story's branch**, as part of that story's work.
- The **epic spec** (`<spec-name>.md`) is committed on the **first story branch created** during the build loop (a small docs commit ahead of that story's code).

Direct-to-`master` doc commits are not used. Between sign-off and the first branch, the spec lives as an approved, uncommitted file under `docs/plans/sc-<n>/`.

### Boundary
`mr-maps` makes **local commits only**. It never pushes; the **user controls `git push` and MR creation**. This keeps MAPS out of irreversible outward-facing actions and matches MetaRouter's one-story-one-MR review flow.

## Testing Model
MetaRouter repos typically have two test tiers and no classic integration tier. `mr-maps` mirrors the repo's own conventions, discovered at runtime. The `ion` reference has exactly these two tiers.

### Unit tests
Per-story, **colocated** next to the source (for example jest `*.test.ts|tsx|js`; Go `*_test.go`), written and run on the story's branch, delivered via the Test Writer's delegation contract per stack, with no persona edit. The per-stack build and unit-test commands are **discovered by the orchestrator at runtime**, the same as the Cypress commands, not encoded in this spec. A MetaRouter repo may span several stacks (for example JavaScript/TypeScript services, React, Go), so the delegation contract names the stack and lets the child determine the build and test commands from the repo.

### Cypress (E2E) — the regression backstop
A Cypress spec exercises a full vertical slice (UI + backend + DB), so it is written and run on its **last-enabling story** — the story that completes the slice — not per-contributing story and not in a blanket after-all phase. For the last-enabling branch to actually run *and commit* the spec green, that branch must **contain** the whole slice, so the enabling relationships are encoded as **blocker/stack edges**: the Cypress-carrying story stacks (transitively) on every story whose code its spec needs.

Where enablers are genuinely independent (no dependency edge among them — e.g. a spec needs A, B, C, none depending on the others), the stack is **linearized**: B stacks on A, C on B, and the Cypress-carrying story on C, so its branch holds the whole slice. This imposes a merge order on otherwise-independent stories (their MRs become a stack), which is the accepted cost of a single spec spanning them — some branch must hold all of them for the spec to be committed green, and stacking is the only arrangement that also satisfies the commit gate. No throwaway integration branch is used: a separate merge branch could *run* the spec but could not *commit* it green on the story branch that becomes the MR, so it does not satisfy the gate.

**In-session running is required.** The exact commands to bring up the project's stack and run Cypress are **discovered by the orchestrator at runtime**, not encoded in this spec or the command — Claude Code sessions working in the repo reliably determine them from it. On each story branch, before committing:
- Run the Cypress set = **new/modified specs for this story** ∪ **existing specs whose exercised code touches files changed on this branch** (and that are runnable on the branch).
- Selecting the affected existing specs is a **reasoning step** (Cypress specs do not statically import the backend they exercise). The Test Writer/Critic maps changed files → UI flows → specs, always including new/modified, with a **"when in doubt, include it"** bias. **In-session runs a targeted subset; CI runs the full Cypress suite post-merge.**
- **All selected specs must pass before the commit.** A commit is **never** made — and nothing is ever pushed — until the Cypress run has happened and passed.
- Failures enter the same triage/fix loop with a **hard cap** (5 iterations); on repeated failure the loop stops and asks the user.

**Coverage vigilance.** Any story behavior that *can* be validated through the UI **must** have a UI-driven Cypress spec (new or existing). Purely internal/backend changes with no UI surface stay unit-only; borderline cases surface to the user. This wires into step 20: a UI-facing acceptance criterion is not "verified" without a passing UI-driven Cypress spec behind it.

**UI-driven only (house rule).** The behavior under test is exercised and asserted **through the UI** (`cy.visit`, `cy.contains(...).click()`, `cy.get(...).type()`, assertions on rendered DOM). No cURL / `cy.request` / DB query may stand in for a user action or serve as the assertion. Setup / teardown / auth via `cy.task('query', …)`, `cy.login()`, `cy.overrideFeatureFlags(...)` is permitted. That is existing house practice (e.g. `cypress/integration/settings-consent-categories.cy.js`), not the thing under test. It reaches the Test Writer as a contract instruction, and the Critic checks it.

### Acceptance verification across branches
Step 20 verifies every acceptance criterion, but the evidence is spread across unmerged story branches, and no single branch holds all of it. This needs no all-containing branch. By construction, every criterion's evidence already exists on some branch after the build loop:
- a UI-facing criterion is backed by its Cypress spec, green on its last-enabling branch;
- a backend or internal criterion is backed by its unit tests, green on their story branch.

The Cypress stacking rule guarantees that any genuinely cross-story spec already ran green on a branch that holds the whole slice. So Step 20 is a **per-criterion roll-up** over evidence already produced. It materializes the AT → AC → Epic chain, confirms each AC against its branch-local evidence, and re-runs nothing across branches. The Verifier delegation, the confidence labels, and the rule that the Epic completes only when every AC is `done` are inherited unchanged from [07-workflow.md](07-workflow.md) Step 20.

## Story Sizing Guideline
The 30-file / 500-line budget is a **soft** guideline enforced at a **single checkpoint** — catalog/plan sizing (step 11), Architect-owned. There is no commit-time gate.

- When a catalog item/story would exceed the budget, the **Architect proposes splitting it into two or more stories** to get under it. Because the catalog and plans pass through user review (steps 13–14), split proposals are approved there — soft by construction.
- **What counts:** fewer than **30 logical/production files** and fewer than **500 logical lines**. The counts **exclude** comments, blank lines, markdown, boilerplate, generated files, and **all test files (unit + Cypress)** — verbose specs and tests never force a split; only real production code does.
- Because this is a **plan-time estimate** (the code does not yet exist), the Architect *estimates* logical files/lines while sizing — no line-counting tooling and no "how does a tool classify boilerplate" problem. Delivered via the step-11 delegation contract — no persona edit.
- **Granularity shift:** in `mr-maps`, one catalog item = one story sized to this budget, overriding stock MAPS's "~3 files per catalog item" default. This is what makes the sizing check meaningful and what lets a budget-sized slice often hold UI + backend together (Cypress runnable within one story), splitting into separate backend/UI stories only when the slice would blow the budget.

## Requirements
- Implemented as a Claude Code custom command (`.claude/commands/mr-maps.md`); Claude Code is the orchestrator, as in `/maps`. Stock `/maps` and `/maps-lite` are not modified.
- Adds exactly one new persona, `.claude/agents/story-reconciler.md` (advisory: proposes reconciliation; the command executes side effects). The eight existing personas are unchanged; all MetaRouter behavior reaches them through the delegation contract.
- Adds one nullable `shortcut_story_id` column to `tasks` (additive, backward-compatible); no other schema change and no new MCP tools.
- Captures the Shortcut epic number at step 1 (`config_set shortcut_epic_number`); assigns story numbers at step 11b via the Story Reconciler; records each on its plan task's `shortcut_story_id`.
- Detects whether a write-capable Shortcut MCP is present; creates epic/stories automatically when it is, and falls back to a manual-creation gate + re-read + link when only a read-only MCP is available. Human confirmation precedes creation in both modes.
- Stores committed docs under `docs/plans/sc-<epic#>/` (flat: `<spec-name>.md`, `sc-<story#>_<slug>.md`); keeps research, catalog, reviews, and test logs in gitignored `.maps/`. Every delegation carries explicit input/output paths.
- Builds via the per-story loop: one branch per story (`<user>/<type>/sc-<story#>/<short-desc>`, ≤40 chars; type proposed by Developer, else asked); independent stories off `master`, dependents stacked; unit tests colocated; Cypress gate (targeted, UI-driven) passing before commit; local commits only.
- Enforces the 30-file / 500-logical-line soft budget once, at catalog sizing, with Architect-proposed story splits; logical counts exclude comments, markdown, boilerplate, generated files, and all test files.
- Human review steps pause the workflow until the user responds, in the conversation.
- Workflow state persists in the task tree; `mr-maps` resumes via `next_task` and follows the same crash-recovery rules as `/maps`.

## Dependencies
- [01-db-schema.md](01-db-schema.md) — adds the nullable `shortcut_story_id` column to `tasks`; otherwise reuses existing task types and the blocker model.
- [02-document-management.md](02-document-management.md) — the artifact/versioning model; `mr-maps` changes only the paths, which the store treats as opaque strings.
- [03-mcp-server.md](03-mcp-server.md) — all state via the existing tools; the only server-visible change is the new column.
- [04-agents.md](04-agents.md) and 04a–04g — the reused personas; plus the new Story Reconciler persona.
- [05-orchestrator.md](05-orchestrator.md) — the orchestration model and delegation-contract mechanism that carries MetaRouter behavior.
- [07-workflow.md](07-workflow.md) — the full workflow this one adapts (Step 20 acceptance verification inherited).
- External: the **Shortcut MCP server(s)** — a read-capable server is required at step 11b; a write-capable server is optional (enables auto-creation of epic/stories).

## Open Questions
1. ~~Where do MetaRouter documents live, and what stays internal?~~ **Resolved** — committed spec + story plans under flat `docs/plans/sc-<epic#>/`; research/catalog/reviews/test-logs in gitignored `.maps/`.
2. ~~How are Shortcut numbers captured and linked, given empty / partial / full epics and a possibly read-only MCP?~~ **Resolved** — epic number at step 1; story numbers at step 11b via the advisory Story Reconciler (classify matched / needs-creation / extra); deterministic link via `shortcut_story_id` on the plan task; human-gated creation with a read-only manual-creation fallback that re-reads and links.
3. ~~How does one-story-one-branch map onto MAPS?~~ **Resolved** — one catalog item = one plan = one `implement` task = one branch; deterministic branch naming with a Developer-proposed `type`; independent stories off `master`, dependents stacked; per-story build/test/commit loop; local commits only.
4. ~~How are MetaRouter repos tested, and how does that shape the workflow?~~ **Resolved** — two tiers only (validated against `ion`); colocated unit tests + UI-driven Cypress on the last-enabling branch; targeted in-session Cypress run gating every commit, full suite in CI; coverage vigilance for UI-validatable behavior. `mr-maps` discovers the specific repo's test setup at runtime.
5. ~~How is the 30-file / 500-line guideline enforced without over-splitting on test volume?~~ **Resolved** — a single soft checkpoint at catalog sizing with Architect-proposed splits; logical counts exclude comments/markdown/boilerplate/generated/test files; one catalog item = one budget-sized story.
6. ~~Where and when are epic-level docs committed, given epics have no branch and the spec is signed off before any story branch exists?~~ **Resolved** — deferred to the build loop and committed on story branches: each story plan file on its own story's branch; the epic spec on the first story branch created. No direct-to-`master` doc commits.
7. ~~What is the canonical "bring up the stack + run Cypress" command?~~ **Resolved** — not pinned here; the orchestrator discovers the stack-up and Cypress commands at runtime from the repo. Encoding them in the spec would only risk staleness and would not transfer between repos.
8. ~~How are Cypress specs handled when their enablers are genuinely independent?~~ **Resolved** — no throwaway integration branch (it could run but not *commit* the spec green on the MR branch, so it fails the commit gate). The Cypress-carrying story stacks transitively on every story its spec needs; independent enablers are **linearized** into a stack, accepting the imposed merge order as the cost of a spec spanning them.

## Version History
| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1.0 | 2026-08-28 | Mike Andersen | Initial draft — document storage, Shortcut integration + Story Reconciler, git branch strategy, unit + Cypress testing model, story sizing guideline. Changes #1–#4 signed off; document-commit branching, Cypress harness, and parallel-enabler fallback left open. |
| 0.1.1 | 2026-08-28 | Mike Andersen | Resolved open questions #6–#8: epic spec committed on the first story branch (plan files on their own branches); Cypress harness discovered at runtime, not pinned; throwaway integration branch dropped in favor of transitive stacking with linearization of independent enablers. |
| 0.1.2 | 2026-08-28 | Mike Andersen | Consistency pass: added "Acceptance verification across branches" (Step 20 as a per-criterion roll-up over branch-local evidence); noted per-stack build and unit-test commands are discovered at runtime; dropped the hardcoded Cypress spec count. |
