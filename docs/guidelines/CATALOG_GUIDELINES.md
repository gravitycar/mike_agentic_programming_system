# Implementation Catalog Guidelines

## Status: Draft

## Table of Contents

1. [What the Catalog Is For](#what-the-catalog-is-for)
2. [The One Rule](#the-one-rule)
3. [Size](#size)
4. [Catalog Structure](#catalog-structure)
5. [What Does Not Go in an Item](#what-does-not-go-in-an-item)
6. [Worked Example](#worked-example)
7. [Common Pitfalls](#common-pitfalls)
8. [Quick Reference: Catalog Checklist](#quick-reference-catalog-checklist)

---

## What the Catalog Is For

The catalog answers one question: **how is the work divided?**

It does not answer what the work is. The specification answers that. It does not answer how to do the work. The implementation plan answers that.

```
Research → Specification → Implementation Catalog → Implementation Plans
(what exists) (what to build)  (how work divides)   (how to build each piece)
```

| Document | Answers | Level |
|----------|---------|-------|
| Specification | What should the system do, and why? | Requirements, no code |
| **Implementation catalog** | **What are the discrete buildable units, and in what order?** | **A list. No code, no file paths** |
| Implementation plan | How exactly do we build this one unit? | Code: paths, signatures, examples |

The specification says "The system SHALL send email notifications within 60 seconds."

The catalog says "Item 3: Email notification sender service."

The plan says "Create `EmailSender` in `src/services/email-sender.ts` with `async send(notification: Notification): Promise<SendResult>`, calling the Resend API with exponential backoff."

Three documents, three altitudes. The catalog is the shortest of the three.

---

## The One Rule

**An item names a unit of work and its dependencies. Nothing else.**

Before you write a sentence into an item, ask what it does. If it tells the reader **which bucket** a piece of work falls into, it belongs here. If it tells the reader **what to build** or **how to build it**, it belongs in the spec or the plan.

Every reader of the catalog can read the specification. You are not their only source. The plan author receives the spec in its delegation context, so restating the spec here buys nothing and costs a document.

---

## Size

There are two sizes to get right: how big an item's **work** is, and how long the item's **entry** is.

### How big an item's work is

Each item becomes one implementation plan, one branch and one human review.

**Ceiling: under 30 logical production files and under 500 logical lines.** Exclude comments, blank lines, markdown, boilerplate, generated files and all test files from both counts.

The ceiling exists so a person can review the item in one sitting. **It is not a target.** A healthy catalog sits well under it. Do not inflate an item toward the ceiling, and do not split an item that is comfortably beneath it.

**Floor: about 3 files or 50 logical lines.** Below that, the plan costs more to write than the code it describes. A one-line configuration change still needs a plan with spec context, test specifications and verification procedures, and that overhead does not shrink with the work. Fold an item that small into a neighbouring item unless a dependency forces it to stand alone.

More items is not cheaper. Every plan carries fixed overhead, so halving item sizes roughly doubles the total volume of planning documents while building exactly the same system.

These are plan-time estimates. The code does not exist yet, so estimate rather than count.

### How long an item's entry is

Target **about ten lines per item**.

| Items in the epic | Expected catalog |
|---|---|
| 5 | ~60 lines |
| 15 | ~180 lines |
| 25 | ~300 lines |

A catalog past 500 lines has absorbed another document's job. Find which one and give the content back.

The catalog is read by the orchestrator to create tasks, by the Critic at plan review, and by each plan author to find its own item. A long catalog costs all of them.

The two sizes are independent. A 25-file item still gets about ten lines here, because the extra work is described in its plan, not in its catalog entry.

---

## Catalog Structure

```markdown
# Implementation Catalog: [Epic Name]

## Build Order

[One line per item, in dependency order. This is the whole map of the epic.]

1. AUTH-1 — Database schema and migrations
2. AUTH-2 — UserService CRUD operations (after AUTH-1)
3. AUTH-3 — JWT authentication middleware (after AUTH-1)
4. AUTH-4 — Registration and login endpoints (after AUTH-2, AUTH-3)

## Items

### AUTH-1 — Database schema and migrations
- **Purpose**: the tables and migrations every other item reads or writes
- **Scope**: the `users` and `sessions` schema, plus their migration
- **Blocked by**: —
- **Blocks**: AUTH-2, AUTH-3
- **Constraints**: DO-NOT-2, DO-NOT-7
- **Acceptance Criteria**: AC-1 — Schema supports required fields

### AUTH-2 — UserService CRUD operations
- **Purpose**: the single service other items call to read and write users
- **Scope**: the user service and its error types
- **Blocked by**: AUTH-1
- **Blocks**: AUTH-4
- **Constraints**: —
- **Acceptance Criteria**: AC-2 — User created, AC-3 — Duplicate email rejected
```

**Purpose** is one line. It says which spec requirement this item builds, in the reader's own terms, citing its `FR-N` id where the requirement has one. It is not a summary of the requirement.

**Scope** names components, not files. "The three modal subcomponents" is scope. A list of paths with line estimates is a plan.

**Blocked by** and **Blocks** carry item ids only. These become blocker relationships in the task tree, so they must be exact.

**Constraints** names which of the spec's Explicit Constraints bind this item, by id, or a dash when none do. **Ids only, never the constraint text.**

This field is routing, which is what a catalog is for. A spec can carry thirty constraints, and a plan author holding the whole spec still has to work out which ones apply to its one item. Telling it which ones is a division-of-work fact and costs a line. Copying what they say is a second copy of the spec that can drift from the first.

**Acceptance Criteria** carries `AC-N — name` references. References only. The spec holds the criteria and the tests that demonstrate them.

Every acceptance criterion in the spec must appear against at least one item. A cross-cutting criterion that no feature item owns gets its own verification item.

---

## What Does Not Go in an Item

| Do not write | Where it belongs | Why |
|---|---|---|
| File paths, line counts, line numbers | the plan | The plan author reads the codebase. A path guessed before planning is often already stale |
| Code, function signatures, data shapes | the plan | The catalog has no code at any altitude |
| A restatement of the requirement | the spec | Every reader of the catalog has the spec |
| The reason a design decision was made | `decisions.md` | The catalog divides work. It does not justify the design |
| The text of a constraint | the spec | Name the constraint's id in the `Constraints` field. Copying what it says creates a second copy that drifts |
| Acceptance test detail, or a coverage matrix | the spec | The spec owns the criterion-to-test mapping. A second matrix is a second thing to keep true |
| Version history, reversals, withdrawn items | git | An item that no longer exists is deleted, not struck through |
| Ticket or story text for an external tracker | whoever creates the ticket | The item heading is the item's name. If a workflow files tickets from the catalog, the agent that files them writes their text, with the spec in hand |

The last row has a common excuse: "a plan author would otherwise rediscover this the hard way." If a plan author lacks context it needs, the fix is to give it the right spec sections in its delegation. Copying spec text into the catalog does not fix that, and it makes two documents that can disagree.

---

## Worked Example

The same item, written twice.

```
❌ Bad (31 lines, and it is a plan):

### PERM-1 — debug_data select permission
- **Branch type / slug**: feat / debug-data-perm
- **Size**: ~1 production file, ~60 logical lines
- **Blocked by**: — (root)
- **Blocks**: PERM-5 and transitively everything
- **Spec**: §5 P1, §13 AC-1, §13 AC-19, §11

**Description**:
> The audit log's debug_data column is not in select_permissions.columns for any
> role, so the API generates no debugData field at all. It cannot be selected,
> filtered, or ordered on. Every piece of field-level audit UI in this epic
> depends on reading it, so this is the first prerequisite.
>
> Add debug_data to select_permissions.columns for Admin, Deployment Manager,
> Integration Manager, Super Admin and Read-Only, on both audit_logs and
> org_audit_logs. Change nothing else: every existing filter clause stays
> byte-identical.
>
> The platform has no filter-only column concept, so exposing a column for
> filtering necessarily exposes it for selection. That tradeoff was evaluated
> and accepted (D18/D25).

**What it builds**: an edit to packages/hasura/metadata/tables.yaml covering
five roles by two tables, ten permission blocks. The only content change is the
added column name in each columns list.

**Evidence**:
- Unit / inspection: acceptance test 1 (inspection), AC-1, and the permission
  half of AC-19.
- Cypress: none, inspection only.

**Carry-forward notes**:
- Do NOT add debug_data to Read Events or Site Reliability Engineer (§11).
- §17.1 is CLOSED; do not re-open it in the plan.
```

Everything the good version drops is elsewhere already. The problem statement is spec §5. The tradeoff is a decision. The evidence is the spec's criterion-to-test mapping. The file path is the plan's to establish.

The constraint is the one case worth looking at closely. The bad version copies what it says. The good version names its id, so the plan author knows this constraint binds this item and reads it where it lives. One line replaces a paragraph and there is still only one copy of the rule.

```
✅ Good (6 lines):

### PERM-1 — Read permission for the audit detail column
- **Purpose**: expose the detail column the whole epic reads (spec §5 P1)
- **Scope**: the API metadata permissions for the five reading roles
- **Blocked by**: —
- **Blocks**: PERM-5
- **Constraints**: §11 DO-NOT-6
- **Acceptance Criteria**: AC-1 — Column selectable by the five roles, AC-19 — No other permission changed
```

The plan author reads spec §5 and §11, finds the metadata file, and writes the plan. That is its job.

---

## Common Pitfalls

### 1. Writing the plan at catalog time

**Problem**: An item names files, line counts or specific attributes.

That is the implementation plan's content. You cannot decide that content before anyone has planned the work. If you try to do so here, the resulting implementation plan will duplicate your efforts but not necessarily your results. Leave planning details out of the catalog.

If an item feels impossible to describe without a file manifest, the item is too large. Decompose it.

### 2. Restating the spec so the plan author does not have to look

**Problem**: An item explains the requirement it implements, or copies the constraints that bind it, so that the plan author "does not rediscover them the hard way."

The plan author has the whole spec. It rediscovers nothing. What it genuinely cannot tell is **which** parts of a long spec apply to its one item, and that is what the `Purpose`, `Constraints` and `Acceptance Criteria` references are for. Point, do not copy.

If a plan author is still missing context it needs, fix its delegation context or its own guidelines. Do not fix it here.

### 3. A coverage matrix the spec already holds

**Problem**: The catalog builds its own criterion-to-item or criterion-to-test table.

Per-item `Acceptance Criteria` references already prove coverage, one item at a time, with nothing to keep in sync. Do not add a summary table on top of them, however large the epic.

In one real epic the spec and the catalog each carried a criterion-to-item table. They **disagreed on 9 of the 16 criteria they both listed**. Nothing reconciled them and nothing noticed. A second view of a mapping is not a convenience. It is a second thing that can be wrong, and it will be.

Acceptance verification reads the specification and the plans. It never reads a catalog table, so a catalog table cannot even be the copy that is right.

### 4. Keeping withdrawn items in place

**Problem**: An item that was removed stays, struck through, with the reason it was removed.

Delete it. The catalog states the division of work that stands. Git holds what it used to say, and `decisions.md` holds why it changed.

### 5. Recording decisions in the catalog

**Problem**: A section collects the decisions the catalog made, so items do not repeat them.

The impulse is right and the destination is wrong. That section belongs in `decisions.md`. A decision the catalog needs is referenced by its `D-N` id.

---

## Quick Reference: Catalog Checklist

### Division of work
- [ ] Every item is one buildable unit with one plan
- [ ] Build Order lists every item in dependency order
- [ ] `Blocked by` and `Blocks` use exact item ids and agree with each other
- [ ] Every acceptance criterion in the spec appears against at least one item
- [ ] Cross-cutting criteria have their own verification item

### Altitude
- [ ] No file paths, line numbers or line counts
- [ ] No code, signatures or data shapes
- [ ] No restatement of any requirement
- [ ] No design rationale
- [ ] Constraints are named by id, with no constraint text copied
- [ ] Purpose cites the `FR-N` id it builds, where one exists
- [ ] Scope names components, not files

### Size of the work
- [ ] No item exceeds 30 logical production files or 500 logical lines
- [ ] No item was inflated toward the ceiling to use it up
- [ ] No item is below about 3 files or 50 logical lines without a dependency forcing it to stand alone

### Size of the entry
- [ ] Items average about ten lines
- [ ] No item needs a file manifest to be understood
- [ ] No withdrawn item is still present
- [ ] The whole catalog is under 500 lines
