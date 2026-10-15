# Implementation Plan: mr-maps Review-Feedback Remediation

## Executive Summary

Colleagues and their coding agents reviewed MRs !4437 through !4453, an epic built by `/mr-maps`. They left 367 comment threads. Few were functional bugs. Most pointed at best practices the generated specs, plans, code, and tests did not follow. This plan takes each pattern from that review and names the exact files and edits in MAPS that should close it, so the next epic does not repeat it.

No code in this plan is a bug fix to the epic that was reviewed. Every edit here changes how MAPS produces future specs, plans, code, and tests.

## Scope

- `docs/guidelines/*.md` — the four guideline documents every persona reads.
- `.claude/agents/*.md` — the eight persona files plus the mr-maps-only Story Reconciler.
- `.claude/commands/mr-maps.md` and `docs/specs/10-mr-maps.md` — mr-maps-only coordination gaps.
- `docs/specs/07-workflow.md` — only where a fix changes a documented step's description.

Items are ordered by how many review comments they explain, most first.

---

## 1. Plan/code/spec drift

**Issue.** Reviewers found implementation plans that still described an old design after the code had moved on, test assertions that contradicted the written spec, and code comments that described behavior the code no longer had. Example: a plan said a downgrade always sets `unattributed: true`, but the generated test asserted the opposite, and nobody caught the mismatch. 18 comments, MRs !4437 !4440 !4442 !4444 !4446 !4452.

**Decision.** A persona instruction alone is not enough here. The Developer is the agent that introduced the drift, so asking it to self-check its own plan is the same weak pattern `test-writer.md`'s own design rationale already warns against: the agent that built something is a poor judge of whether it quietly deviated. This item formalizes the check as a new, independent, Critic-owned review task: **Step 15a — Plan/Code Reconciliation Review**, delegated to a fresh child session right after each story's code is built. It reuses the existing `agent-review` task type (already in the schema and already used for the Story Reconciler and the catalog review), so no database or MCP change is needed. It runs once per `implement` task, as a single pass with no loop, the same pattern Step 11a already uses for the catalog review.

**Files to update:**

- `docs/guidelines/IMPLEMENTATION_PLAN_GUIDELINES.md`
  - Add a new entry to "Common Pitfalls to Avoid", after pitfall 10: **"11. Letting the Plan Go Stale After the Build Diverges From It."** Show a bad/good pair: bad is a plan stating `return user;` while the shipped code returns `omit(user, ['password'])`, with no line in the plan noting the change. Good is the same plan corrected in place, with a one-line note of what changed and why. Note that this is now checked independently at Step 15a, not left to self-report.
  - Add a line to the "Completeness" block of the "Quick Reference: Implementation Plan Checklist": "The plan was reconciled against the final shipped code before the story was marked done."

- `.claude/agents/developer.md`
  - Under "Guidelines for Building Code", add a new numbered item after item 7 ("Never Hardcode a Real Secret"): **"8. Reconcile the Plan When You Deviate."** If building the plan's exact code is impossible or wrong (an import doesn't exist, a claim like "already applied" turns out false, a signature needs to change), stop, edit the plan file to match the code you are about to write, and only then write the code. This is the first line of defense, catching drift before it ever reaches review. It is cheap, but it is not the only check — Step 15a independently verifies the result.

- `.claude/agents/critic.md`
  - Add a new responsibility, after "Step 13: Critical Review #3": **"Step 15a: Plan/Code Reconciliation Review."** "After each story's code is built, diff the implementation plan against the code actually shipped for that one catalog item. One pass, no loop, the same pattern as Step 11a: a mismatch here is cheap to catch now and expensive to catch after tests pass against a plan nobody will read again."
  - Add a new guidelines subsection, modeled on "Review 11a: Catalog Review":

    ```markdown
    ### Review 15a: Plan/Code Reconciliation Review

    Read the implementation plan and the code the Developer built from it, for this one
    catalog item. Check every factual claim the plan makes against what the code actually
    does: file paths, exports, function signatures, data shapes, and any "this already
    exists" or "already applied" claim.

    Reach exactly one determination:

    - **MATCH** — the plan and the code agree. No action.
    - **PLAN STALE** — the code is correct (it does what the spec needs), but the plan's
      text no longer describes it. Route: the Developer edits the plan file to match the
      code. No rebuild.
    - **CODE WRONG** — the code deviates from the plan in a way that breaks the plan's
      intent. Route: the same code-undo-and-rebuild path as a Step 17 "CODE WRONG"
      triage — the plan is correct, the code needs to match it.
    - **ESCALATE** — you cannot confidently tell which of the above applies, or the plan
      itself now looks wrong in light of what had to be built. Surface your reasoning to
      the user, the same way a "CRITERION WRONG" triage escalates.

    Record the determination and your reasoning in a review artifact, the same way you
    record a Step 17a triage. This step does not consume the test/fix loop's 5-iteration
    budget — it runs once, before any test has even been written.
    ```

  - Add a "Step 15a" line to "Task Management", mirroring the Step 11a pattern: update task to `in_progress`, retrieve the plan and the built source files via `artifact_list` and the file tracker, read both, reach a determination, write a review artifact (`artifact_type="triage_review"`, reusing the existing type since this is the same shape of record), mark the task `done` with the determination in `results`.

- `.claude/commands/maps.md`
  - Add a row to the Context Curation Table, after the row for step 15: `| 15a | Critic (plan/code reconciliation) | sonnet | implementation_plan, built source files for this item | Single pass, no loop — diffs the plan against the shipped code for one item, same pattern as 11a |`. Route it to `sonnet`, not `opus`: this is a mechanical consistency check between two existing documents, the same kind of job as Step 17a triage (also `sonnet`), not open-ended design judgment.
  - Add a new section, near "Catalog Review and Approval (Steps 11a, 11b)": **"## Plan/Code Reconciliation (Step 15a)."** Describe: one `agent-review` task per `implement` task, created at the same time as the `implement` task (After Plans Approved, Step 14) and blocked by that specific `implement` task. Single pass, no loop. Route its determination: `MATCH` → no action; `PLAN STALE` → delegate the Developer to edit the plan file only; `CODE WRONG` → code-undo, delegate the Developer to rebuild from the unchanged plan; `ESCALATE` → pause and ask the user, same presentation as a "CRITERION WRONG" escalation.
  - Update "After Plans Approved (Step 14)": when creating each `implement` task, also create its Step 15a task (`type="agent-review"`, `agent="critic"`), blocked by that same `implement` task.
  - Update "After All Code Built (Step 15)" → rename to **"After All Code Built and Reconciled (Steps 15, 15a)"**: the unit test task (Step 16) is now blocked by all `implement` tasks **and** all Step 15a tasks, not just the `implement` tasks. Unit testing should not start against code a reconciliation pass hasn't yet confirmed or corrected.
  - Add a line to "Success Criteria (per task type)": "**Plan/Code Reconciliation**: Plan and code agree, or the mismatch was corrected, before unit testing begins (single pass, no loop)."

- `docs/specs/07-workflow.md`
  - Insert a new line into the numbered step list, between step 15 and step 16: `15a. **Critic** — Plan/Code Reconciliation Review. Single pass, no loop (same pattern as 11a). Diffs the plan against the shipped code for one item; routes MATCH / PLAN STALE / CODE WRONG / ESCALATE.`
  - Add one line to "Requirements": "Step 15a is not a loop and carries no iteration limit, the same as Step 11a — it runs once per implement task, between code being built and unit tests starting."

- `.claude/agents/verifier.md`
  - Keep the Step 20a addition from the original draft of this item: "While inspecting code or artifacts for a judgment-based Acceptance Test, note any comment or test name whose claim contradicts what the code actually does, even if the Acceptance Test itself passes. Report it in your summary as a data-quality finding for the orchestrator to route back to the Developer." Step 15a only runs once, right after the initial build — it does not re-run after a Step 17c rebuild during the test/fix loop, so this Verifier check remains a useful last-resort catch for drift introduced later in that loop.

**mr-maps note.** `mr-maps` builds one story at a time instead of materializing all `implement` tasks up front, so Step 15a is inserted as an inline step in its per-story loop, not as a separately blocker-wired task. Update:

- `.claude/commands/mr-maps.md` and `docs/specs/10-mr-maps.md`, Overlay 5: insert a new **step 4a** between "4. Build the story's code" and "5. Unit tests": "**Plan/code reconciliation.** Delegate the Critic for a single-pass reconciliation review of this story's plan against its just-built code (Step 15a in the base workflow). Route `MATCH` / `PLAN STALE` / `CODE WRONG` / `ESCALATE` exactly as the base does. Do not proceed to step 5 until this resolves to `MATCH` or a correction has been applied."
- `.claude/commands/mr-maps.md`, "Model Routing Overlay" table: add "Critic (plan/code reconciliation)" to the existing "Overlay 5 loop" row, alongside Developer (build), Test Writer, Critic (triage), and Reviser — all `sonnet`, same reasoning as the base.

**Aside, unrelated to this item — fixed.** While reading `maps.md` to wire this in, I found six `task_create` calls (Steps 10a and 11a's security/catalog review task creation, in both the "LLM Security Review Loop" and "Creating Follow-Up Tasks" sections) using `type="security_review"` or `type="catalog_review"`, neither of which is in the database's `TaskType` list (`src/db/schema.ts`) or its runtime validator (`src/mcp/validation.ts`). `docs/specs/01-db-schema.md` confirms the intended design: a single generic `agent-review` type for every agent-driven review, distinguished by its `name` and `agent` fields, not by a dedicated `type` per review kind. As written, all six calls would have failed validation at runtime. Corrected all six to `type="agent-review"` in `.claude/commands/maps.md`. Left the unrelated `artifact_type="security_review"` usages in `llm-security-auditor.md` untouched — `artifact_type` is a free-text field with no such constraint, so those were never broken.

---

## 2. Duplicated logic, constants, and helpers not reused across stories

**Issue.** Each story runs in a fresh context with no memory of prior stories, so the same shape, constant, or query builder gets retyped instead of imported. Example: a fallback object hand-copied an existing shape from another file, so the two can now drift apart. 15 comments, MRs !4439 !4442 !4445–!4452.

**Decision.** Two fixes, one proactive and one reactive, because the MR evidence shows both failure modes. Some duplication was foreseeable at catalog time (the Architect could have named the shared piece up front) and some was not (an implementation detail one story invents mid-build, that a later story's Developer has no way to predict from the spec or catalog). The proactive fix handles the first case. The reactive fix, a terse build-summary handed forward from every earlier story in the epic, handles the second, and is the same mechanism this plan uses for item #3's cross-story test duplication below.

**Files to update — proactive (catalog-time):**

- `docs/guidelines/CATALOG_GUIDELINES.md`
  - Add a new entry to "Common Pitfalls", after pitfall 5: **"6. Not Naming a Shared Utility Up Front."** When two or more items will need the same constant, data shape, or helper, give that utility its own catalog item, with the items that need it listed as `Blocked by` it. Leaving this implicit means every item's plan author independently decides whether to build or reuse it, and they decide differently.
  - Add a line to "Quick Reference: Catalog Checklist", under "Division of work": "Any constant, shape, or helper that 2+ items need is its own catalog item, not left for each item to reinvent."

- `.claude/agents/architect.md`
  - Under "Building the Implementation Catalog", add a bullet: "Before finalizing the catalog, scan the planned items for any constant, data shape, or utility function that more than one item will need. Give it its own catalog item that the others are `Blocked by`."

- `docs/guidelines/IMPLEMENTATION_PLAN_GUIDELINES.md`
  - Extend pitfall 5 ("Overlooking Existing Utilities"). Add one sentence: "This includes code built by an earlier catalog item in the same epic, not only code that predates the epic. Check the earlier item's plan and shipped files before writing a new constant, shape, or helper."

**Files to update — reactive (build-time, the new mechanism):**

- `.claude/commands/maps.md`
  - Extend the existing "## File Tracker" section. It already collects "Files created"/"Files modified" from each child's final summary; add a third field it now also collects: **"Build summary (terse)"**. Rewrite the section:

    ```markdown
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
    It is not an MCP artifact and is not registered via `artifact_register`.
    ```

  - This list is cumulative within one epic only. Never carry it across epics.

- `.claude/agents/developer.md`
  - Under "Working as a Delegated Session", add a new step **"1c. Read prior work in this epic."** Placed right after step 1 ("Read your context"): "If your delegation prompt includes a 'Prior Work in This Epic — Developer' list, read it before writing any code. For every bullet that could plausibly overlap what you are about to build, open the specific files listed beside it and check before writing anything new. Reuse what you find there instead of writing a parallel implementation."
  - Under "Final message", add two new fields, between "Files modified" and "Key decisions":
    - **"Build summary (terse)"**: a numbered list, 3 to 8 items, each a short verb phrase of 12 words or fewer, no exposition and no reasoning. Example: `1) Defined a shape-map in shapes.ts. 2) Added search() to look up a shape by key. 3) Added validate() to check an object against a shape.` If a story needs more than about 8 bullets to describe, it was probably sized too large for one catalog item (the same ceiling `CATALOG_GUIDELINES.md` already sets). Explicitly call out any **existing or legacy file you touched or fixed**, not only new files you created — e.g. `4) Fixed a null-check bug in legacy-audit.js`. A sibling story scanning for overlap needs to see that an existing shared path was touched, not just that something new was built (see item #8).
    - **"Reviewed for overlap"**: one line stating which prior bullets (if any) you considered and what you decided, e.g. `Reviewed 3 prior stories: reused shapes.ts's search() from story 2; no other overlap found.` If there was no prior work to review (first story in the epic), say so.

- `.claude/agents/test-writer.md`
  - Under "Working as a Delegated Session", add the same step **"1c. Read prior work in this epic,"** extended to both lists: "If your delegation prompt includes 'Prior Work in This Epic' lists (Developer and/or Test Writer), read both before writing any test code. The Developer list tells you what production helpers and shapes already exist, so you don't mock or reimplement something that's already there (see item #7 below). The Test Writer list tells you what test fixtures, builders, and Cypress commands already exist, so you extend them instead of recreating them."
  - Under "Final message", add the same two fields: **"Test summary (terse)"** (same format and size cap as the Developer's) and **"Reviewed for overlap."**

- `.claude/commands/mr-maps.md`, Overlay 5
  - Add one confirming line: "The base's File Tracker and Build Summaries (Step 15/16 context) apply unchanged here, across the per-story loop. Every story's Developer and Test Writer delegation includes the terse build summaries of every earlier story in this epic, regardless of which git branch it landed on." This is the exact mechanism that would have caught most of item #2 and #3's findings, which came from an `mr-maps` epic.

---

## 3. Test duplication, unit and Cypress

**Issue.** Two sub-patterns. Near-identical unit test cases that vary one field but are not table-driven (8 comments, MRs !4439 !4442 !4444–!4446). Cypress specs that copy-paste setup or helpers byte for byte instead of sharing a command, plus related anti-patterns: raw SQL seeding inside specs, forced clicks and fixed waits, bypassing existing house test helpers (13 comments, MRs !4448–!4452).

**Decision.** The within-story half (near-identical cases in one test file) is a specification problem: tell the Test Writer to prefer table-driven tests. The cross-story half (duplicated Cypress helpers and fixtures across specs written by different Test Writer sessions) is the same reactive problem as item #2, and uses the same fix: the terse build-summary mechanism above, extended to the Test Writer. No separate mechanism needed — see item #2's `test-writer.md` and `maps.md` edits, which already cover this.

**Files to update — within-story (table-driven tests):**

- `docs/guidelines/IMPLEMENTATION_PLAN_GUIDELINES.md`
  - In "Unit Test Specifications", add a rule: "When 3 or more test cases share the same shape and differ only in one or two fields, specify them as one parameterized table (so the Test Writer can turn it into `it.each`), not as separate repeated cases."

- `.claude/agents/test-writer.md`
  - Under "Guidelines for Writing Tests", add a new item after "5. Use Implementation Plan Test Specs": **"5a. Prefer Table-Driven Tests Over Repeated Cases."** When 3 or more cases share a shape and differ by one or two fields, use a builder with overrides plus `it.each`, not separate near-identical bodies. Before adding a new case, check whether an existing table already covers the same combination — watch for a `beforeEach` default that already sets the value you think you are varying.

**Files to update — cross-story (Cypress and fixture duplication):**

- `.claude/agents/test-writer.md`
  - Under section 9, "Cypress / End-to-End Test Guidelines", add a new subsection after "Building test data": **"Reusing test infrastructure."**
    - "Check the 'Prior Work in This Epic — Test Writer' list (see 'Working as a Delegated Session') and the project's existing shared Cypress helpers and custom commands before writing setup or prelude code. Once 2 or more specs would otherwise repeat the same prelude, extract a shared command or task instead."
    - "Seed data through the app layer, the GraphQL API, or an existing custom command. Do not write raw SQL or mutate the database directly inside a spec."
    - "Never use a fixed `cy.wait(ms)` or an inflated timeout to paper over flakiness. Use a retry-able assertion instead — the same principle as the existing rule against `{ force: true }` on a stuck click."
    - "Don't re-assert in Cypress what a unit test already covers. A Cypress spec asserts the user-visible outcome of a flow; it does not re-verify internal logic a unit test already owns."

No `maps.md` or `mr-maps.md` changes beyond what item #2 already specifies — the Test Writer delegation already carries both prior-work lists.

---

## 4. Secret-scanner false positives on fake test fixtures

**Issue.** Generated API-key-shaped fixture values keep tripping the Aikido scanner, and reviewers have to manually dismiss the same false alarm each time. 10 comments, MRs !4437 !4440 !4445 !4452.

**Decision.** Checked against Aikido's own documentation before writing this fix, since a guideline built on a guess about scanner behavior is not actually a fix. Aikido considered exempting test/sandbox-shaped values from its generic secret detector and explicitly rejected it: "some organizations put production data into their test environments," so generic findings stay in the results and rely on manual triage. There is no fixture format that reliably escapes detection. What Aikido does provide, and document, is an inline suppression comment, the same one its underlying gitleaks engine uses: `gitleaks:allow`, on the same line as the value. That is the one mechanism this item relies on — exclusively, not as one habit among several.

**The exact mechanism:**
- Add the comment token for the file's language, followed by `gitleaks:allow`, on the **same line** as the fixture value. JavaScript/TypeScript: `const apiKey = 'test-fixture-key'; // gitleaks:allow`. Python: `api_key = 'test-fixture-key'  # gitleaks:allow`. Apply the same pattern for any other language the project uses, same placement rule.
- Apply it to **every** fixture value that could read as a credential — an API key, token, password, or connection string — regardless of how obviously fake it looks to a human. "Obviously fake" is not a property the scanner evaluates.
- This is a machine-read suppression marker, not documentation, so it is exempt from the existing "avoid comments in code" rule the same way a security-warning or "do not edit" comment already is.

**Files to update:**

- `docs/guidelines/IMPLEMENTATION_PLAN_GUIDELINES.md`
  - Replace the last sentence of pitfall 10 ("Hardcoding a Real Secret"). Current text: *"A test fixture may use an obviously fake value, such as `'test-key-xxx'`, but never one that could pass for real."* Replace with: *"A test fixture must carry a `gitleaks:allow` comment on the same line as the value (e.g. `const apiKey = 'test-fixture-key'; // gitleaks:allow`), regardless of how fake the value looks. Aikido's own secrets scanner deliberately does not exempt test-shaped values — it relies on manual triage for every generic finding — so an obviously-fake format is not a fix. The documented suppression comment is."*
  - Apply the identical wording update to the matching checklist line in "Quick Reference: Implementation Plan Checklist" → "Completeness".

- `.claude/agents/developer.md`
  - Section "7. Never Hardcode a Real Secret" quotes the old wording verbatim (it applies when a plan's Unit Test Specifications section shows an example fixture). Update it to the new wording above, so the two copies do not drift.
  - Add one line to the "Code Comment Guidelines" carve-out (where it already permits "security warnings, 'do not edit' notes"): "a `gitleaks:allow` suppression marker on a fixture value" is the same kind of vital, machine-read exception.

- `.claude/agents/test-writer.md`
  - Under "Mocking External Dependencies → Credentials and secrets", replace the bullet with: "Any fixture value shaped like a credential must carry a `gitleaks:allow` comment on the same line, written for the file's language (`// gitleaks:allow` in JS/TS, `# gitleaks:allow` in Python). Do not rely on the value merely looking fake — Aikido's generic secret detector does not exempt test-shaped values, by its own documented design."
  - Under section 8, "Avoid Comments in Test Code," add one sentence: "A `gitleaks:allow` suppression marker is a machine-read exception, in the same category as a vital security-warning comment, not a step comment — it stays."

---

## 5. Missing or inconsistent loading/error state, and dual sources of truth

**Issue.** Includes error states rendered as if they were empty states, async data consumed before its loading flag is checked, and two state owners — a data hook and a stateful UI component — disagreeing with each other. 12 comments, MRs !4442 !4448 !4450–!4452.

**Decision.** Specifying the three states explicitly closes the spec-side gap, but it does not stop a Developer from building a new loading/error/empty mechanism when the codebase already has one — which is plausibly how the dual-source-of-truth bug happened: a new ad hoc hook built alongside an existing stateful component, instead of discovering how the codebase already wires the two together. Add a reuse check to the chain, not just a specification requirement: the Researcher looks for an existing pattern, the Architect names it if found, and the Developer must check for one before building a new one, the same reuse discipline item #2 already applies to shared utilities.

**Files to update:**

- `docs/guidelines/SPECIFICATION_GUIDELINES.md`
  - Add a new pitfall after pitfall 15 (secrets): **"16. Leaving the Loading/Error/Empty Contract Implicit."** Any requirement describing a UI component that fetches data must state its loading, error, and empty-state behavior as distinct, verifiable requirements. An error rendered identically to "no data yet" is a wrong requirement, not a missing one. Where the component wraps a stateful third-party component (e.g., a data-table with its own pagination), the spec must name exactly one owner of that state.
  - Add the matching line to "Quick Reference: Specification Checklist" → "Completeness": "Any UI component that fetches data has an explicit loading/error/empty contract, including a single named owner for any state a wrapped component also keeps."

- `.claude/agents/researcher.md`
  - Under "Codebase Analysis → 3. Document conventions", add a bullet: "If the epic involves fetching data in the UI, look for an existing shared mechanism for loading/error/empty handling — a hook, a wrapper component, a higher-order component. Document it under 'Reusable Components' if one exists, by name and file path. Say explicitly if none exists; that absence is as useful to the Architect as a pattern would be."

- `.claude/agents/architect.md`
  - Under "Writing Specifications", add a bullet: "When a feature involves async data in the UI, state the loading/error/empty contract explicitly, and name exactly one owner of any state also kept by a wrapped third-party component. If the Researcher found an existing loading/error/empty mechanism, name it in Technical Context as the one the plan must use."

- `docs/guidelines/IMPLEMENTATION_PLAN_GUIDELINES.md`
  - Broaden pitfall 3 ("Skipping Error Handling"). Add a sentence and example: "This includes a query that depends on another query's output — skip it until the dependency resolves, and propagate its loading and error state rather than defaulting to an empty value while it is pending."
  - Extend pitfall 5 ("Overlooking Existing Utilities") with a named example tied to this recurring finding: "...including a shared loading/error/empty handling hook or wrapper component. Building a second one, instead of reusing the first, is how two components end up disagreeing about the same piece of state."

- `.claude/agents/developer.md`
  - Under "Guidelines for Writing Implementation Plans", add a line to item 2 ("Be Concrete and Specific") or as its own short item: "For any component consuming async or derived data, specify all three states explicitly — loading, error, and populated — including which single component owns any state also kept by a wrapped third-party component."
  - Under item 5 ("Reference Existing Code"), add a sentence: "Before specifying a new loading/error/empty handling mechanism, check the spec's Technical Context and the codebase itself for an existing one. Reuse it. Only specify a new one if none exists, and say so in the plan's Notes, so the Critic can confirm that absence at review."

---

## 6. Spec/plan bookkeeping IDs leaking into code, test names, and review citations

**Issue.** Flagged across nearly a dozen MRs (!4440–!4448, !4450–!4452), with one MR alone citing roughly 70 instances. This is the same failure the existing "no spec IDs in code comments" rule targets, but review shows it also happens in test names, and in the plan's own code examples, which the Developer copies verbatim.

**Files to update:**

- `docs/guidelines/IMPLEMENTATION_PLAN_GUIDELINES.md`
  - In the "Code Comment Guidelines" template block, extend the existing sentence ("Never reference a spec, plan, or decision-record ID in a code comment...") with: "This rule applies equally to test names and descriptions (`it('...')`, `describe('...')`). Name the behavior under test, never the criterion or plan ID."

- `.claude/agents/critic.md`
  - Under "Review #3: Implementation Plans Review → Buildability", add a checklist line: "No code example inside the plan itself contains a comment citing a spec, plan, or decision ID. The Developer copies code examples verbatim, so an ID-laden comment in the plan becomes an ID-laden comment in shipped code."

- `.claude/agents/test-writer.md`
  - No change needed. Section 8 already states this rule for test comments and test names explicitly. Note this in the plan so the gap is understood as the plan's code examples and MR-review citation habits, not the Test Writer persona.

---

## 7. Tests that don't actually prove their claim

**Issue.** Mock-only assertions, one-directional coverage of a bidirectional invariant, and fixtures that reimplement production logic instead of importing it. 6 comments, MRs !4439 !4440 !4448 !4452.

**Decision.** Test Writer's own self-check is the first line of defense, but it is the same "same agent checks its own work" pattern item #1 moved away from. The difference here is volume: 6 comments does not justify a new mandatory review session the way item #1's 18 did. Instead, reinforce it through two existing review points that already run on every story, at no added session cost: Critic's Review #3 (plan review, before any test code exists, the cheapest point to catch a weak test design) and the Verifier's Step 20a inspection (already extended once in item #1).

**Files to update:**

- `.claude/agents/test-writer.md`
  - Add a new numbered item after "4. Test Categories": **"4a. Prove the Test Actually Tests the Claim."**
    - Before finalizing a test, check that it would fail if the property under test were violated. Imagine breaking the code path and confirm the test would catch it.
    - For a test that checks two related collections stay in sync (e.g., an action list against a lookup map), assert both directions of containment, not just one.
    - A test fixture or helper must import the real production function it is meant to exercise, never reimplement that function's logic. A reimplementation drifts from the original silently.

- `.claude/agents/critic.md`
  - Add to "Review #3: Implementation Plans Review → Completeness", a line: "Each row in the plan's Unit Test Specifications states an observable behavior change in its Expected Result column, not merely that a mock was called. A test case whose expected result is 'the mock was invoked' proves nothing about the code's actual behavior — send it back for a concrete, observable expectation."

- `.claude/agents/verifier.md`
  - Extend the Step 20a inspection note added in item #1 (currently: note any comment or test name whose claim contradicts the code). Broaden it to: "...or any test you notice asserting only that a mock was called, checking an invariant in one direction only when it describes a two-way relationship, or using a fixture that reimplements a production function instead of importing it. Report any of these in your summary as a data-quality finding for the orchestrator to route back to the Test Writer, even when the Acceptance Test itself passes."

---

## 8. Cross-story coordination gaps (mr-maps only)

**Issue.** Fixes in one story's MR not propagated to sibling MRs touching the same legacy path, a feature flag shipped with no CI coverage of the flag-on state, and analytics/telemetry parity dropped when a story replaces a legacy path. 6 comments, MRs !4452 !4453.

**Decision.** Of these three, only the first is actually the same root cause as items #2 and #3: a fix one delegated session made is invisible to a later sibling session, the identical shape as the duplication findings, just a missed fix instead of a missed reuse opportunity. It gets the same fix, not a parallel one: the build-summary mechanism from item #2, reinforced (see that item's `developer.md` edit) to explicitly call out any existing or legacy file touched or fixed, not only new files created. No separate catalog-time mechanism for it here — my original draft had the Architect name this as a blocker at catalog time, but the actual finding was a fix made *during* a story's build, which the Architect cannot foresee before any code exists. That mechanism is dropped.

The other two are genuinely different failure modes, not cross-session amnesia, and keep their own fixes: a feature flag shipped without testing its "on" state is a test-coverage gap within one story's own build, and dropped analytics parity is a case of not reading the legacy code being replaced carefully enough, not a case of missing another story's work.

**Files to update:**

- `docs/specs/10-mr-maps.md` and `.claude/commands/mr-maps.md`, Overlay 6 (Cypress): add a line — whenever a story ships a feature flag gating meaningful new behavior, its Cypress gate must include a run with the flag in its "on" state, not only the default state.
- `docs/specs/10-mr-maps.md` and `.claude/commands/mr-maps.md`, Overlay 7 (Story Sizing): add a line — when a story replaces a legacy path, its catalog item's Scope must note whether existing analytics or telemetry events need an equivalent on the new path, so parity is not dropped silently.

No `story-reconciler.md` or `architect.md` change for this item — see item #2's `developer.md`/`maps.md` edits for the fix covering the propagation sub-finding.

---

## 9. Unverified production-safety properties

**Issue.** New queries not run through EXPLAIN, a migration missing a stated lock impact on a populated table, unmemoized derived values, and data fetched eagerly when it was only needed on demand. 7 comments, MRs !4450–!4452.

**Decision.** Keep this to what can actually be measured and handed off, not a specific migration technique. An earlier draft of this item recommended preferring a non-locking index build (e.g., `CREATE INDEX CONCURRENTLY`) as a default; MAPS already investigated that for `ion` and found it unviable there, and prescribing it generally would be wrong for any project where the database platform or migration framework doesn't support it. Replace "prefer a non-locking form" with "measure locally, then hand off a vetted command for production": validate lock impact and query cost with an EXPLAIN run against representative local data, state that impact in the plan, and give a human the exact command to re-run against production once local testing says it's safe to check there. This also matches how the spec guidelines already separate what MAPS can verify on its own from what needs a human and a real environment.

**Files to update:**

- `docs/guidelines/IMPLEMENTATION_PLAN_GUIDELINES.md`
  - Add a new pitfall after the ones added above: **"Skipping a Measurable Safety Check."**
    - A new or changed query against a populated table states how it was validated locally — an EXPLAIN run against representative seeded data — not just that it was written.
    - A migration adding an index or constraint to a populated table states its lock impact, established the same way (a local EXPLAIN against representative data), in the plan's Notes. Alongside it, give the exact command a human can re-run against production once local testing confirms it is safe to check there. Do not prescribe a specific non-locking migration technique as a default — its availability depends on the project's database platform and migration framework, and assuming it is available is itself a way to get this wrong.
    - A value derived from another value, and consumed by something that memoizes, is itself memoized.
    - Per-row or on-demand data is fetched when the user asks for it, not eagerly for every row on mount.

- `.claude/agents/developer.md`
  - Add to "Guidelines for Building Code": a new item stating the same four checks above, in the Developer's own voice, as things to verify (or flag as a plan gap) before marking a build task done.

---

## 10. Naming and structure convention violations

**Issue.** Internal planning vocabulary leaking into code names, components exceeding the one-export-per-file convention, deep imports bypassing a public index, and new components not following an established sibling pattern. 10 comments, MRs !4447 !4452.

**Decision.** This one has to start with the Researcher, not the Architect. By the time the Architect writes the spec, it only has whatever the Researcher found — a vague "note conventions" bullet produces a vague, unanchored line like "the project uses PascalCase," which gives the Developer nothing to actually follow. The fix is to make convention-discovery a concrete, procedural duty with a required deliverable shape, not a one-line aside: every convention the Researcher reports must be anchored to a real file path and a real example, and it gets its own named section in the codebase summary so it cannot get buried inside a generic "Conventions to Follow" list.

**Files to update:**

- `.claude/agents/researcher.md`
  - Replace the single "Document conventions" bullet (Codebase Analysis, item 3) with its own numbered step, **"3a. Actively Discover Naming and Structural Conventions,"** placed right after it:
    - Search for existing constant or label patterns relevant to the epic's domain — e.g., grep for similarly-suffixed exported constants (`*_LABELS`, `*_TYPES`, `*_CONFIG`) before assuming none exists.
    - Find a sibling implementation of a similar feature, component, or hook, if one exists (e.g., if the epic adds a modal, find an existing modal and note its hook-naming pattern).
    - Note which structural conventions the project actually follows in practice: one export per file, importing from a package's public index versus a deep path, and whether configured import aliases are actually used.
    - **Every convention reported needs a concrete example with a file path.** "The project uses PascalCase for components" is not useful by itself. "Modals follow a `useXModal` hook pattern, see `src/hooks/useAuditLogModal.js`" is. State explicitly when no sibling pattern exists — that absence is as useful to the Architect as a pattern would be (same principle as item #5's loading/error/empty convention check).
  - Under "Document Format → Codebase Summary", add a dedicated subsection to the template, replacing the generic conventions bullet list:
    ```markdown
    ## Naming & Structural Conventions
    - [Convention]: [concrete example, with file path]
    - [Convention]: [concrete example, with file path]
    ```
  - Add a line to "Success Criteria": "Every reported naming or structural convention is backed by a concrete example and file path, not a generality."

- `.claude/agents/architect.md`
  - Add a bullet under "Writing Specifications": "Copy the concrete examples from the Researcher's 'Naming & Structural Conventions' section into Technical Context, by name and file path, so the plan inherits them rather than gesturing at 'existing patterns' in the abstract."

- `.claude/agents/critic.md`
  - Add to Review #3 "Buildability" checklist: "Naming in the plan reuses the codebase's existing vocabulary (an established `*_LABELS`-style constant, existing component names) rather than inventing new terms. No vocabulary from the planning process itself (engineering jargon describing the plan's own construction) appears in a proposed code or component name."

- `docs/guidelines/IMPLEMENTATION_PLAN_GUIDELINES.md`
  - Extend pitfall 5 ("Overlooking Existing Utilities") with one more sentence: "This includes structural conventions already established in the project — one export per file, importing from a package's public index rather than a deep path, using configured import aliases. State in the plan which convention applies, rather than leaving the Developer to default to whatever it writes first."

---

## 11. Smaller, one-off findings

**Issue.** Five scattered findings: commit/MR title not matching the dominant change type, a new entity type missing required relational scope metadata, a silent data-loss path in a merge function that should fail loudly, and an architecture deviation that should have been logged in the spec's decision record but was not.

**Decision.** Broaden the silent-failure fix. "A merge or compose function fails loudly" is too narrow — it names one function shape when the actual principle is general: MAPS-built code should fail loudly by default, for any case it wasn't built to handle, not just merges. And a flat rule is wrong on its own, because a silent failure is occasionally the correct design (an API contract that requires a specific response shape even on an unrecoverable case, for example). The fix needs both halves: prefer loud failure generally, and when a Developer concludes silent failure is genuinely unavoidable, it does not get to decide that alone — it stops and escalates to the user, with its reasons stated as a bullet list, through the orchestrator. This reuses the exact escalation shape `developer.md` already has for a missing secret-retrieval mechanism (stop, report the gap, don't invent a workaround) and the existing `question`-task machinery Critic already uses, so no new mechanism is needed, just the same pattern applied to a new trigger.

**Files to update:**

- `docs/guidelines/IMPLEMENTATION_PLAN_GUIDELINES.md`
  - Add a new pitfall after the ones added above: **"Preferring a Silent Failure Over a Loud One."**
    - By default, code that meets an input, case, or state it was not built to handle fails loudly: it throws, or otherwise makes the gap visible immediately, naming the specific case it could not handle. This applies broadly — parsers, data transformations, a `switch`'s default branch, any function reducing several inputs to one output — not only merge or compose functions.
    - A silent failure (returning a default, dropping a field, swallowing an exception) is sometimes genuinely the right call. When the plan calls for one, it states the specific reasons as a bullet list, not just the design choice on its own.
    - If the Developer concludes, while building, that a silent failure is unavoidable and the plan did not call for one, it does not decide this alone. It stops and reports the gap — with the same bullet-list reasoning — in its final message's Issues field, for the orchestrator to escalate to the user.

- `.claude/agents/developer.md`
  - Add to "Guidelines for Writing Implementation Plans": "State the commit/MR title's type (feat, fix, refactor, etc.) based on the dominant change in this story's files, not inherited automatically from the catalog item's original label."
  - Replace the narrow merge/compose bullet with the general rule above, plus: "If you conclude a silent failure is unavoidable and the plan didn't call for one, stop. Do not build it in quietly. Report it in your final message's Issues field with a bullet list of why, the same way you already report a missing secret-retrieval mechanism (see 'Never Hardcode a Real Secret' above) — this is not your decision to make alone."
  - Sharpen the "Final message" protocol's existing "Issues" line to: "Issues: [anything the next task should know — including a bullet-list justification for any unavoidable silent failure, so the orchestrator can escalate it]."

- `.claude/commands/maps.md`
  - Add a short new section, near "Handling the 'DEFER EPIC' recommendation": **"## Escalating a Necessary Silent Failure."** When a Developer's final summary's Issues field reports a silent failure it could not avoid, create a `question` task (parent the relevant `implement` task, `agent="user"`) naming the function and the Developer's stated reasons. Route it through the normal Open Question Resolution process: present it to the user, who either accepts the justification or requires a redesign. If a redesign is required, it becomes a new build task like any other post-review fix.

- `docs/guidelines/CATALOG_GUIDELINES.md`
  - Add a line to the "Catalog Structure" guidance for `Scope`: "When an item introduces a new entity type, its Scope notes whether that entity needs relational or scope metadata (e.g., parent references) for its natural place in audit or display scope, so this is not decided silently at build time."

- `.claude/agents/architect.md`
  - Add a line under "The Decision Record": "Record any deliberate deviation from an established module boundary or convention here, naming the convention it departs from and why. An unrecorded deviation reads as an oversight to the next reviewer, even when it was intentional."

---

## Rollout notes

- Every edit above is additive to an existing file. None requires renumbering an existing pitfall, checklist, or step — new items are appended within their section.
- Three places currently repeat the same sentence verbatim (the fake-secret wording in `IMPLEMENTATION_PLAN_GUIDELINES.md`, `developer.md`, and `test-writer.md`; the code-comment ID rule in `IMPLEMENTATION_PLAN_GUIDELINES.md` and `developer.md`). Update every copy in the same pass — a partial update recreates the drift problem this plan is trying to fix everywhere else.
- Items 1–7 and 9–11 apply to both `/maps` and `/mr-maps`, since both run the same eight personas and guideline documents. Item 8 is `/mr-maps`-only.
- No change in this plan touches the MCP server, the database schema, or the compressor. This is a documentation-and-persona change only. Item 1's new Step 15a is the one exception worth naming: it adds one new delegated child session per story to every epic, reusing the existing `agent-review` task type rather than adding a new one. That is a real, recurring token cost, accepted deliberately because the alternative — a persona instruction the same agent checks against its own work, in a context window that may already be close to full — is the exact failure mode that produced 18 of the 367 review comments.
- Items 2 and 3 share one mechanism: the terse build-summary list forwarded through the existing File Tracker. Its token cost grows with epic size, but linearly and shallowly — each entry is a handful of short bullets, not a file. A 30-story epic adds a few hundred short lines to later delegations, far cheaper than having each Developer or Test Writer read prior stories' files by default. The mechanism depends entirely on the terseness constraint holding; if a future revision lets "Build summary (terse)" grow into prose, it stops being cheap and the whole point is lost.
