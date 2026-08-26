# MAPS Specification: `/maps-lite` (Lightweight Workflow)

## Status: Draft

## Overview
`/maps-lite` is a second Claude Code custom command — a lightweight sibling of `/maps` for **small changes and bug fixes**. Full `/maps` front-loads design through a 20-step, spec-driven pipeline; that ceremony is right for a feature build but is overkill for a one-or-two-file fix. `/maps-lite` collapses the pipeline to the minimum that still produces **tested, verified code**, while reusing every existing piece of MAPS: the MCP server, the SQLite database, the compressor, and the eight agent personas.

`/maps-lite` is a **separate command**, not a flag on `/maps`. It changes only orchestration — the infrastructure and personas are shared. Where the two commands would otherwise drift, they are unified behind a common delegation contract (see [Delegation Contract](#delegation-contract-and-section-writing-mode)).

## Context
`/maps-lite` sits alongside `/maps` in the same layering established by [05-orchestrator.md](05-orchestrator.md):
- The **workflow** below defines the steps and their sequence (the lite analog of [07-workflow.md](07-workflow.md)).
- The **orchestrator** (the `/maps-lite` command + Claude Code) executes those steps at runtime.
- The **agent personas** ([04-agents.md](04-agents.md)) define the mindset for each step — reused unchanged in behavior, extended only to support section-writing (below).

The two commands share one database, one epic model, one artifact store, and one set of personas. This is what makes `/maps-lite` cheap to build and what makes **escalation** (lite → full) a promotion in place rather than a restart.

## Guiding Principles
1. **Reuse, don't fork.** Same infrastructure, same personas, same acceptance-verification machinery. Divergence is a cost to be minimized.
2. **Cut ceremony, keep rigor.** Drop the gates that only pay off at feature scale; never drop tests or acceptance verification.
3. **Self-scaling.** Volume-oriented steps (user hand-off, judgment verification) only materialize when there is work for them, so a 1-criterion fix incurs near-zero overhead without a hardcoded "how small is small" threshold.
4. **Structure over discipline.** Where a step must not be skipped, enforce it with the task graph (blockers), not with orchestrator memory.

## When to Use `/maps-lite` vs `/maps`
Routing at invocation is a **user decision** — nothing has been analyzed yet, so it cannot be automated. Use `/maps-lite` when the change is a single coherent unit of work:
- Roughly **one catalog item's worth** (~1–3 files), one feature or behavior affected.
- **No new architecture**, no schema/data migration, no API-contract change.
- **Does not touch** authentication, secrets/credentials, or LLM integration.
- Acceptance is expressible as a small number of criteria (often one).

If a change violates these, use full `/maps`. If a change *looks* small but proves otherwise, the workflow catches it and escalates (see [Escalation](#escalation-to-full-maps)). Misrouting is the main way a lite lane causes harm, so both an **early sizing gate** and a **late escape hatch** back the user's judgment.

## Workflow
Sequential execution within a single Claude Code conversation, same as `/maps`. State lives entirely in the task tree; on re-invocation `/maps-lite` resumes via `next_task`.

1. **User** — Describes the bug/small change. May optionally supply a suggested **approach** and/or **acceptance criteria**.
2. **Orchestrator** — Creates and registers the **change brief** scaffold: one document with three empty, fenced sections (`context`, `mini-spec`, `plan`), each carrying a `_(pending: <agent>)_` placeholder. See [The Change Brief](#the-change-brief).
3. **Researcher** — Fills the `context` section: which feature(s) the issue touches, which files are relevant, and which existing automated tests cover the affected behavior.
4. **Architect** — Fills the `mini-spec` section: the issue, the approach, and the acceptance criteria. If the user supplied an approach and/or criteria, incorporate them; otherwise author them. **For every element the Architect authors itself, it creates a `question` task** (see [Confirmation Gate](#acceptanceapproach-confirmation-gate)). Acceptance criteria use the standard `AC-N — <name>` + **Owner** convention from the specification guidelines, so the acceptance-verification machinery works unchanged.
5. **Orchestrator — Sizing gate.** Using the context and mini-spec, assess scope against the routing signals above (>~3 files, new architecture, schema/API-contract change, or touches auth/secrets/LLM). If over threshold, **recommend escalation to `/maps`** before any planning effort is spent. The "touches auth/secrets/LLM" signal here also substitutes for the LLM-security-auditor step that `/maps-lite` otherwise omits. The system recommends; the user decides.
6. **User — Confirmation gate (conditional).** If step 4 produced any `question` tasks, the user resolves each one interactively (approve / edit / redirect). The planning step is **blocked** until all are resolved. If the user supplied approach + criteria, there are no questions and this step is a no-op.
7. **Developer** — Fills the `plan` section: implementation steps, unit tests (and whatever other automated tests the project routinely runs), and the acceptance tests that will demonstrate each criterion. Reads the `context` and `mini-spec` sections directly from the change brief.
8. **Critic** — Reviews the plan for flaws, gaps, and unasked questions; compiles the open-question Q&A for the user. May instead return an **"escalate to `/maps`"** verdict if the change has outgrown the lite lane.
9. **User** — Answers all open questions interactively (one at a time; resolutions recorded before moving on).
10. **Developer** — Updates the `plan` section based on the answers (section-writing mode; other sections untouched).
11. **Developer** — Builds the code from the plan.
12. **Test Writer** — Writes and runs the automated tests.
13. **Triage/fix loop** — Critic triages failures (code / test / both), routing to Reviser, Developer, or Test Writer; retest. Hard limit: **5 iterations**.
14. **Acceptance verification (setup + MAPS-owned run)** — Materialize one Acceptance Test (AT) task per acceptance test and one Acceptance Criterion (AC) task per criterion; wire **AT → AC → Epic** blockers. Test Writer runs executable ATs (referencing existing tests, never duplicating them); the **Verifier is delegated only when an AT needs judgment**; the orchestrator confirms purely-deterministic ACs mechanically. See [Acceptance Verification](#acceptance-verification-conditional-step-20).
15. **Acceptance triage/fix loop** — Same as step 13, plus a **"criterion/spec wrong"** verdict that stops the loop for that criterion and escalates to the user. Hard limit: **5 iterations**.
16. **User-owned verification (conditional)** — Only if any AT is User-owned. Present the manual test(s) plainly; the Verifier confirms the corresponding criteria. (No progressive-disclosure hand-off at this scale.)
17. **Completion** — The Epic completes when every AC task is `done`. Asserted (non-executed) criteria are surfaced but do not block completion.

## The Change Brief
The three planning artifacts of full `/maps` (research summary, specification, implementation plan) are merged into **one document, the change brief**, with three agent-owned sections. Rationale: `/maps` separates spec from plan to support gates (spec sign-off, catalog) that `/maps-lite` does not have, so the separation pays no rent here; and a single document gives each downstream agent its upstream context directly, without `artifact_list` juggling.

- **Ownership:** `context` → Researcher, `mini-spec` → Architect, `plan` → Developer. Each agent writes **only its own section**.
- **Scaffold created by the orchestrator, not an agent.** The scaffold is fixed plumbing; having the command write it keeps the section fences byte-stable (agents rely on that for Edit-based writes) and keeps structure-vs-content separation intact.
- **Section fences.** Each section is delimited so an agent can rewrite exactly its own section without disturbing others:
  ```markdown
  <!-- MAPS:SECTION context -->
  ## Codebase Context
  _(pending: Researcher)_
  <!-- MAPS:/SECTION context -->
  ```
- **One artifact identity, versioned by insert-new-row.** The change brief is registered once (artifact type `change_brief`); each section write registers a new version. Latest = most recent.
- **10K-token limit still applies** to the combined document; for genuinely small changes this is not a constraint.

## Delegation Contract and Section-Writing Mode
Both commands delegate document-producing work to child sessions through **one uniform contract**, so their plumbing cannot drift:

Every delegation carries a **`mode`** flag and a **`doc path`**. `mode` is the discriminator:
- **`document` mode** (full `/maps`) — the agent owns the whole file at `doc path`.
- **`section` mode** (`/maps-lite`) — the agent additionally receives a **section identifier** and writes only that section.

`doc path` and the section identifier are **explicit arguments**, never inferred from the mode. A `document`-mode delegation carries **no** section identifier — a dummy/sentinel value is prohibited, as it would create a second source of truth that must agree with `mode`. The `artifact_type` may also be passed as part of the contract.

Each document-producing persona gains one small, workflow-agnostic block describing this contract:

> **Section-writing mode.** When your delegation names a shared document and a section, write *only* that section: use Edit to insert/replace it, preserve all other sections, omit any top-level `#` heading (use the `##` heading you are given), and register the shared document as your artifact. Otherwise (document mode) write the whole document at the given path.

### Full-`/maps` retrofit (in scope for this initiative)
To realize the shared contract, full `/maps` is retrofitted in the same change:
- The `/maps` orchestrator passes `mode: document` + `doc path` (+ optional `artifact_type`) at each delegation.
- The **hardcoded, step-number-coupled output paths are stripped** from every document-producing persona (`Outputs` and `Task Management` sections), replaced by "write to the path given in your delegation."
- Because this modifies a working command, it requires its own verification pass: a full `/maps` run end-to-end (this repo dogfoods MAPS) to confirm nothing regressed.

## Acceptance/Approach Confirmation Gate
When the Architect authors an approach or acceptance criterion the user did not supply, that decision must be confirmed before code is built — the lite analog of `/maps` spec sign-off (the git-commit sign-off itself is dropped in lite). The gate is **enforced structurally**, not by orchestrator discipline:

- The **Architect creates one `question` task** (task type `question`, already in the schema) per invented approach/criterion element — it owns the *content* of the question.
- The **orchestrator wires the blockers** — it owns graph *structure*. The step-7 planning task is set `blocked_by` each question task, so `next_task` cannot surface planning until every question is resolved. This is the same AT→AC→Epic gating pattern used in acceptance verification.
- **Resolution is recorded, not just closed.** The user's decision is written into the question task's `results` before it is marked `done`.
- **Reject/edit path.** If the user rejects or edits, the orchestrator re-delegates the Architect to revise the `mini-spec` section (section mode) *before* the question is marked `done`. Only a settled question closes.
- If the user supplied both approach and criteria, no questions are created and the gate is a no-op.

The question tasks are the source of truth for the gate; the orchestrator may also mirror the open questions into the mini-spec for readability.

## Escalation to Full `/maps`
Escalation backs the user's routing decision at two points:
- **Early (sizing gate, step 5)** — before planning, catching a misroute for the cost of only the context + mini-spec.
- **Late (Critic verdict, step 8; or acceptance triage, step 15)** — when complexity surfaces during planning or verification. The Critic's triage vocabulary gains an **"escalate to `/maps`"** verdict, analogous to the "criterion/spec wrong" verdict.

The system **recommends**; the user **decides**. Escalation is never automatic.

**Graduation = promotion in place.** Because both commands share the DB, epic, and artifact store, escalation reuses accumulated work rather than restarting:
- `context` section → serves as / is registered as the `codebase_summary` (the Researcher's work is reused).
- `mini-spec` section → handed to the Architect as a **draft** to expand into a full `specification`.
- `plan` section → discarded (full `/maps` builds a catalog → plans).

Full `/maps` then re-enters at the spec-review step, not at step 1. The mapping is deliberately simple; re-running the Architect for a proper spec is accepted rather than auto-converting the merged document into every full-`/maps` artifact.

## Acceptance Verification (conditional Step 20)
`/maps-lite` keeps the full Step 20 **machinery and guarantee** and gates only the two volume-oriented pieces, so ceremony self-scales with criterion count and owner split.

**Load-bearing (never trimmed):**
- The **AT → AC → Epic blocker chain** — nothing completes unverified. Cheap even at one criterion (two tasks, two blockers).
- **An AT is `done` only when it passes;** failures route to the Critic triage loop (with the "criterion/spec wrong" verdict).
- **Confidence recorded** per AT and rolled up to the AC (**Confirmed** = deterministic executed evidence; **Asserted** = inspection/judgment, no hard proof; **User-confirmed** = human performed the procedure). An AC is only as strong as its weakest AT. This label is the anti-"green-checkmark-theater" guarantee — it is what keeps a lite fix from being rubber-stamped.

**Trimmed (conditional):**
- **Verifier delegation is conditional.** The Verifier is delegated only when at least one AT requires *judgment* (benchmark interpretation, rendered-output judgment, structural inspection). For purely-deterministic ACs the **orchestrator confirms mechanically** — verify every AT is `done` + Confirmed, then mark the AC `done`; the refuse-if-an-AT-is-not-done safety check is a status check requiring no judgment.
- **User-owned hand-off is conditional.** If there are no User-owned ATs, step 16 is skipped entirely. When present (typically one or two), the tests are presented plainly — the slim-list / progressive-disclosure hand-off from `/maps` is not used at this scale.
- **Standalone verification-report artifact is optional** at small N; the records written into each AC task's `results` are the verification record.

**Common case.** For a criterion like "input field `name` is now required," the acceptance test is often the very unit test the Test Writer already wrote — so verification reduces to: materialize one AT (pointing at that passing test) + one AC + blockers, and the orchestrator confirms. Near-zero marginal ceremony, rigor fully intact.

## Loop Limits
The existing limits are reused unchanged — no lite-specific caps:
- **Test/fix loop:** 5 iterations.
- **Acceptance fix loop:** 5 iterations.
- **Critic review:** no cap — it is a single human-driven pass (Critic Q&A → user answers → Developer updates), matching `/maps`'s uncapped human review.

Rationale: hard limits exist to bound *automated* loops from spinning forever; a small change does not warrant *fewer* fix attempts than a large one, and a lower cap would only make `/maps-lite` give up prematurely on a legitimately tricky fix.

## Requirements
- Implemented as a Claude Code custom command (`.claude/commands/maps-lite.md`); Claude Code is the orchestrator, as in `/maps`.
- Uses the MCP server tools for all task, blocker, and artifact management; adds no new tools.
- Reuses the eight existing personas; the only persona change is the section-writing-mode block plus the path-decoupling from the full-`/maps` retrofit.
- The orchestrator creates and registers the change-brief scaffold before delegating the Researcher.
- Every delegation uses the uniform `mode` + `doc path` (+ conditional section id, optional `artifact_type`) contract.
- Architect-authored approach/criteria are gated by `question` tasks blocking the planning task.
- Acceptance verification materializes AT/AC tasks with AT→AC→Epic blockers and records confidence; the Epic completes only when every AC is `done`.
- Human review steps pause the workflow until the user responds, in the conversation.
- Workflow state persists in the task tree; `/maps-lite` resumes via `next_task` and follows the same crash-recovery rules as `/maps` (orphan `in_progress` tasks on restart).
- Code undo before rebuild uses `git checkout` + delete of new files, as in `/maps`.

## Dependencies
- [03-mcp-server.md](03-mcp-server.md) — all state via the MCP server; `/maps-lite` uses the existing 16 tools (`task_create` with type `question`, `blocker_add`, `artifact_register`, `next_task`, etc.).
- [01-db-schema.md](01-db-schema.md) — reuses the existing task types (`question`, `acceptance-test`, `acceptance-criterion`) and blocker model; no schema change.
- [04-agents.md](04-agents.md) and 04a–04g — the personas activated by the workflow, extended with section-writing mode.
- [05-orchestrator.md](05-orchestrator.md) — the orchestration model and full-`/maps` command this one is retrofitted alongside.
- [07-workflow.md](07-workflow.md) — the full workflow this one is a lightweight analog of; the acceptance-verification design is inherited from its Step 20.

## Open Questions
1. ~~Should the lightweight workflow be a flag on `/maps` or a separate command?~~ **Resolved** — A separate command, `/maps-lite`. Keeps each command's instructions focused and avoids conditional branching throughout the `/maps` orchestrator.
2. ~~Should the three planning artifacts be merged, and if so, does one agent write the merged document?~~ **Resolved** — Merged into a single change brief; the three original agents each write their own fenced section via section-writing mode. Preserves persona reuse and improves context flow.
3. ~~How is the Architect-authored approach/criteria confirmation prevented from being skipped?~~ **Resolved** — The Architect creates `question` tasks; the orchestrator blocks the planning task by them, so `next_task` structurally cannot proceed until they are resolved.
4. ~~Does `/maps-lite` need its own acceptance-verification system?~~ **Resolved** — No. It reuses Step 20's machinery and gates the Verifier delegation and User-owned hand-off on there being work for them.
5. ~~Should `/maps-lite` include the LLM-security-auditor step?~~ **Resolved** — No. "Touches auth/secrets/LLM" is instead an escalation signal at the sizing gate, bouncing such changes to full `/maps`.
6. Step-numbering here is descriptive; the canonical sequencing is the task tree and its blockers, not the numbers. (Cosmetic — resolves when the `/maps-lite` command is authored.)

## Version History
| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1.0 | 2026-08-26 | Mike Andersen | Initial draft — workflow, change brief, delegation contract + retrofit, confirmation gate, escalation, conditional acceptance verification, loop limits |
