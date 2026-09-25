# Specification Guidelines for AI-Assisted Development

This guide synthesizes best practices from industry leaders (GitHub, Thoughtworks, EPAM, InfoQ), critical assessments (Martin Fowler, Dev.to), and practical implementations to create effective specifications for AI-assisted development.

---

## Table of Contents

1. [Core Principles](#core-principles)
2. [When to Write Specifications](#when-to-write-specifications)
3. [Specification Structure](#specification-structure)
4. [Writing Effective Requirements](#writing-effective-requirements)
5. [The Constitution Layer](#the-constitution-layer)
6. [Common Pitfalls to Avoid](#common-pitfalls-to-avoid)
7. [Verification and Testing](#verification-and-testing)
8. [Living Specifications](#living-specifications)
9. [Quick Reference: Specification Checklist](#quick-reference-specification-checklist)
10. [Conclusion](#conclusion)

---

## Core Principles

### 1. Specifications Are Executable, Not Documentation

**Key Insight** (Augment Code): "Outdated specs produce broken implementations"

Specifications drive automation—they're not post-facto documentation. When specs drift from reality, implementations break, creating a self-correcting mechanism.

```
✅ Good: Executable specification that drives test generation
❌ Bad: Documentation written after implementation
```

### 2. Specify What, Not How

**Key Insight** (Multiple sources): Constrain outcomes, not implementation details

```
✅ Good: "Notifications must be delivered within 60 seconds (95th percentile)"
❌ Bad: "Use Redis queue with 3 worker processes"
```

The specification defines acceptance criteria; the plan phase determines technical approach.

### 3. Explicit Constraints Are Critical

**Key Insight** (Zencoder, EPAM): "What NOT to build" is as important as what to build

```markdown
## Explicit Constraints (DO NOT)
- **DO-NOT-1**: Do NOT implement push notifications (Phase 2 feature)
- **DO-NOT-2**: Do NOT modify the existing User model
- **DO-NOT-3**: Do NOT create a separate microservice (embed in monolith)
- **DO-NOT-4**: Do NOT build custom email service (use Resend)
```

Constraints prevent scope creep and guide AI agents away from generic solutions that don't fit your architecture.

### 4. Specifications Are for Humans First, AI Second

**Key Insight** (Dev.to critical review): "Developers often fail to formulate exactly what they want in plain text"

If another senior developer couldn't implement from your spec without clarification, it's not detailed enough. The AI agent isn't the primary audience—your team is.

### 5. Balance Completeness with Conciseness

**Key Insight** (Thoughtworks): "Covering the critical path without enumerating all cases"

```
✅ Good: "Support email, SMS, and in-app notifications"
❌ Bad: Listing every possible notification scenario in exhaustive detail
```

Focus on critical paths, edge cases, and non-obvious requirements. Skip obvious implementation details.

---

## When to Write Specifications

### Use Full Specifications For:

1. **Production features** - Anything customer-facing or mission-critical
2. **Multi-file implementations** - Changes affecting 3+ files or multiple services
3. **Integration with existing systems** - Must respect existing patterns and architecture
4. **Compliance requirements** - Security, privacy, regulatory constraints
5. **Long-running tasks** - Work spanning multiple sessions or developers
6. **Team coordination** - Multiple developers or cross-functional work

### Skip Specifications For:

1. **Quick prototypes** - Experiments and proof-of-concepts
2. **Simple utilities** - Single-purpose helper functions
3. **Bug fixes** - Clear, isolated issues with obvious solutions
4. **Small UI tweaks** - Cosmetic changes without logic
5. **One-off scripts** - Temporary tooling

**Decision Framework** (Red Hat): If the task takes 3-5 days, requires coordination, or has compliance needs, write a specification.

### Understanding Greenfield vs Brownfield

**Greenfield Project:**
- Starting from scratch with no existing code
- "Green field" = empty, unused land ready for new construction
- No legacy constraints, technical debt, or existing patterns
- Free to choose any stack, architecture, or patterns
- Example: Day 1 of a new project

**Brownfield Project:**
- Working within an existing codebase with established patterns
- "Brown field" = previously developed land with existing structures
- Must respect existing architecture, conventions, dependencies
- Technical debt and legacy code constrain choices
- Integration with existing services required
- Example: Adding features to an established codebase

**Why This Matters for Specifications:**

Spec-driven development provides the most value in **brownfield contexts**. Several articles specifically emphasized this:

- **EPAM**: "Best for end-to-end or standalone feature builds, especially in brownfield contexts"
- **Sogl (Dev.to)**: "Designed for greenfield projects" was listed as a *limitation* of Spec Kit
- **Augment Code**: "Legacy System Evolution" as a key benefit
- **Dave Patten**: "Moving from vibe coding a cool app to building real-world brownfield projects"

In greenfield projects, AI can generate generic "best practices" solutions. In brownfield projects, AI must understand YOUR specific patterns, existing services, architectural decisions, and technical constraints—which is where specifications and the constitution layer become critical.

This is why the constitution layer in these guidelines is so detailed—it captures all the brownfield context that AI agents need to generate code that fits your existing system rather than generic solutions.

---

## Specification Structure

### The Complete Specification Template

Based on synthesis of all sources, here's the recommended structure:

```markdown
# [Feature Name] Specification

## Document Metadata
- **Version**: 1.0.0
- **Author**: [Name]
- **Created**: YYYY-MM-DD
- **Status**: Draft | Review | Approved | Implemented
- **Related Specs**: Links to dependent specifications

## Executive Summary
[2-3 sentence overview of what this spec accomplishes and why it matters]

## User Story
As a [user type], I want [capability], so that [benefit].

## Stakeholders
- **Primary**: [End users and their context]
- **Secondary**: [Support teams, operations]
- **Tertiary**: [Business owners, compliance]

## Acceptance Criteria
[The conditions that must be true for the implementation to be considered complete — the *what*, not the *how*. Each criterion must be **verifiable**: there is a definite way to confirm whether it holds — by measurement ("p95 latency < 100ms"), by inspection ("a Help button appears in the toolbar"), or by observed behavior ("clicking Help opens the docs URL in a new window"). Each criterion has a stable ID (AC-N), a short human-friendly **name**, a verifiable statement, and a verification **owner** — MAPS if MAPS can confirm it on its own, User if any part requires a human. Each criterion is demonstrated by one or more Acceptance Tests below. Business outcomes measurable only in production belong in Success Metrics, not here.]

**ID stability**: IDs are assigned once and never renumbered or reused. If a criterion is removed, its number is retired, not recycled; new criteria append. This keeps traceability stable across spec revisions.

**Referencing criteria**: anywhere a criterion is referenced — in Acceptance Tests, Success Metrics, or implementation plans — use `AC-N — <name>`. The ID is the authoritative match key; the name is a reading aid that may be edited, so tooling matches on ID while humans read the name.

**Cross-cutting criteria**: a criterion that no single buildable unit owns — because it spans the whole system (performance, security, consistency, accessibility) — is tagged `**Scope:** cross-cutting` on its entry. Feature-scoped criteria need no scope marker. A cross-cutting criterion is covered by a dedicated *verification catalog item* rather than a feature item; its distributed implementation is enforced by the spec's constraints/NFRs (and the Critic's review of each plan), while its verification lives in that one item.

1. **AC-1 — Valid payload accepted**: The `POST /notifications` endpoint returns 202 with a notification ID for a valid payload. **Owner:** MAPS
2. **AC-2 — Report PDF well-formed**: The exported report PDF is visually well-formed (header present, no clipped text, correct spacing). **Owner:** User
3. **AC-3 — Notification latency under 100ms**: p95 latency for `/notifications` is under 100ms in the benchmark harness. **Owner:** MAPS **Scope:** cross-cutting

## Success Metrics
[Post-launch outcomes that define whether the feature achieved its purpose. Unlike Acceptance Criteria, these can only be observed in production — with real usage, over time — so MAPS does not verify them and they carry no owner. They capture intent and serve as the post-launch validation checklist. Each metric has a stable ID (SM-N) and a short human-friendly name. Where a metric has a dev-time proxy, cross-reference the Acceptance Criterion (by `AC-N — <name>`) that stands in for it during the build; that AC's Acceptance Tests carry the verification MAPS can actually perform.]

**ID stability**: same convention as Acceptance Criteria — SM-N assigned once, never renumbered or reused.

1. **SM-1 — Support ticket reduction**: Support tickets related to notification delivery drop by 40% within one quarter of launch.
2. **SM-2 — Service uptime**: The system sustains 99.9% uptime over a rolling 30-day window.
3. **SM-3 — Production latency at scale**: p95 latency stays under 100ms at 10,000 concurrent production users. *Verified in dev by:* AC-3 — Notification latency under 100ms.

## Context and Problem Statement
[Why are we building this? What problem does it solve? What happens if we don't?]

### Current State
[How things work today, including pain points]

### Desired State
[How things should work after implementation]

## Functional Requirements

### Core Capabilities
[What the system must do - organized by capability area. Each requirement has a stable
ID (FR-N), assigned once and never renumbered or reused.]

#### [Capability Area 1]
- **FR-1**: Requirement 1
- **FR-2**: Requirement 2
- Edge cases and exceptions

#### [Capability Area 2]
- **FR-3**: Requirement 1
- **FR-4**: Requirement 2

### User Workflows
[Key user journeys in Given/When/Then format]

**Scenario: [Name]**
- **Given**: [Initial state]
- **When**: [Action or trigger]
- **Then**: [Expected outcome]

## Non-Functional Requirements

### Performance
- Response time targets
- Throughput requirements
- Scalability expectations

### Security
- Authentication/authorization needs
- Data protection requirements
- Threat model considerations

### Compliance
- Regulatory requirements (GDPR, HIPAA, etc.)
- Industry standards
- Audit requirements

### Reliability
- Uptime targets
- Error handling strategy
- Retry logic requirements

## Explicit Constraints (DO NOT)

⚠️ **Critical Section** - What NOT to build or change

[Each constraint has a stable ID (DO-NOT-N), assigned once and never renumbered or reused.]

- **DO-NOT-1**: Do NOT [constraint] — [one clause of reasoning]
- **DO-NOT-2**: Do NOT [constraint] — [one clause of reasoning]
- **DO-NOT-3**: Must NOT [constraint] — [one clause of reasoning]

[One clause each. A constraint whose justification needs a paragraph is a design
decision: state the constraint here and record the argument in decisions.md.]

## Technical Context

### Existing Systems
- Current stack: [Technologies in use]
- Integration points: [Services this connects to]
- Data models: [Relevant existing schemas]
- Authentication: [How auth works]
- API versioning: [Current version, compatibility needs]

### Architectural Constraints
- Must use [existing pattern/library]
- Must respect [architectural principle]
- Must integrate with [existing service]

## Data Requirements

### Data Model
[Key entities, relationships, and attributes]

### Data Flow
[How data moves through the system]

### Data Retention
[Storage duration, archival, deletion policies]

## API Contracts
[If this exposes or consumes APIs]

### Endpoints
POST /api/v2/notifications   
  Request: { ... }   
  Response: { ... }   
  Errors: 400, 401, 429, 500

### Event Schemas
[If using event-driven architecture]

## UI/UX Requirements
[If there's a user interface]

### Wireframes/Mockups
[Link to designs or describe key screens]

### User Interactions
[Key flows and interactions]

### Accessibility
[WCAG compliance, keyboard navigation, screen readers]

## Acceptance Tests

✅ **A high-level verification map** — for each Acceptance Criterion, name how it will be demonstrated and by what method, so a reviewer can confirm at sign-off that every criterion is verifiable. Keep each entry to a few lines; the detailed procedure lives in the implementation plan that addresses the criterion — concrete test cases for MAPS-owned criteria, manual step-by-step procedures for User-owned criteria. Each entry traces back to one or more criteria above.

**ID stability**: same convention as Acceptance Criteria — `AT-N` assigned once, never renumbered or reused.

1. **AT-1 — Valid payload accepted**
   - **Verifies**: AC-1 — Valid payload accepted
   - **Method**: automated test
   - **Expected**: A POST with a valid payload returns 202 with a notification ID.

2. **AT-2 — Notification latency within budget**
   - **Verifies**: AC-3 — Notification latency under 100ms
   - **Method**: benchmark
   - **Expected**: p95 latency for `/notifications` measures under 100ms in the harness.

3. **AT-3 — Report PDF renders correctly**
   - **Verifies**: AC-2 — Report PDF well-formed
   - **Method**: manual visual inspection
   - **Expected**: The exported PDF shows the header, with no clipped text and correct spacing. (Detailed procedure lives in the plan addressing AC-2.)

**Method vocabulary** (each method implies an owner):

| Method | Implied owner |
|--------|---------------|
| automated test | MAPS |
| benchmark | MAPS |
| headless UI drive | MAPS |
| inspection (agent reads code/artifacts) | MAPS |
| manual UI interaction | User |
| manual visual inspection | User |

**Consistency rule**: if any test that `Verifies` an acceptance criterion uses a User method, that criterion's **Owner** must be `User`.

## Dependencies

### Upstream Dependencies
[What must exist before this can be built]

### Downstream Impact
[What will be affected by this change]

### External Dependencies
[Third-party services, APIs, libraries]

## Risks and Mitigations

[Each risk has a stable ID (RISK-N), assigned once and never renumbered or reused.]

| ID | Risk | Probability | Impact | Mitigation |
|----|------|-------------|--------|------------|
| RISK-1 | [Risk description] | High/Med/Low | High/Med/Low | [How to address] |

## Out of Scope

**Explicitly not included in this specification:**

- [Feature that might be assumed but isn't included]
- [Related work deferred to future phases]

[Do not list alternative approaches that were considered and rejected. Record those in
decisions.md. A rejected approach sitting among the requirements is something an
implementer can build by mistake.]

## Open Questions

[Unresolved decisions that need stakeholder input. An open question carries its options
because somebody still has to choose between them. Each question has a stable ID (OQ-N),
assigned once and never renumbered or reused, and a short human-friendly name.]

1. **OQ-1 — [short name]**: [What needs to be decided?]
   - **Options**: [Alternatives being considered]
   - **Decision by**: [Date or milestone]

[When a question is resolved, reduce it here to one line — the ID, the answer, the
date — and record the reasoning in decisions.md, as the decision it produced.]

## Appendices

### Glossary
[Domain-specific terms and definitions]

### References
[Links to related documentation, research, or external resources]

**Best Practice: Document Source Links**

When your specification involves complex third-party integrations or technical implementations based on external documentation, include a dedicated "Documentation" subsection with relevant reference links.

**Why this matters:**
- Preserves research context for future implementers
- Enables quick verification of technical details
- Facilitates troubleshooting and debugging
- Maintains traceability of design decisions

**When to include documentation links:**
- Third-party API integrations (Google, Zoom, Twilio, etc.)
- Complex protocols (WebSocket, OAuth, webhooks)
- SDK usage (libraries with specific implementation patterns)
- Regulatory/compliance requirements (GDPR, HIPAA, SOC 2)
- Research papers or whitepapers informing design decisions

**Where to place them:**
- In relevant requirement sections (e.g., under specific service handlers)
- In the main References/Appendices section for general resources
- In Technical Context section for architecture-level documentation

### Version History

[One row per version. Keep each Changes cell to a single line naming what changed.
Not why: record the reasoning in decisions.md, with the decision it produced. Not the
diff: git holds that. A cell that wants a paragraph is a decision, so record it there
and leave a single line here.]

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.1.0 | YYYY-MM-DD | Name | Added SMS quiet hours |
| 1.0.0 | YYYY-MM-DD | Name | Initial specification |
```

---

## Writing Effective Requirements

### The INVEST Criteria

Good requirements are:
- **Independent**: Can be implemented separately
- **Negotiable**: Specify outcome, not implementation
- **Valuable**: Clear user or business benefit
- **Estimable**: Team can size the work
- **Small**: Fits in reasonable timeframe
- **Testable**: Has clear acceptance criteria

### Use Active, Specific Language

```
✅ Good: "The system SHALL send email notifications within 60 seconds"
✅ Good: "Users MUST be able to disable SMS notifications per notification type"
❌ Bad: "The system should probably send notifications quickly"
❌ Bad: "Users might want to control preferences"
```

**Language patterns:**
- SHALL / MUST = Required
- SHOULD = Recommended
- MAY = Optional
- MUST NOT = Prohibited

### Given/When/Then Format (BDD Style)

**Best for user workflows and test scenarios:**

```markdown
**Scenario: User disables SMS during quiet hours**
- **Given**: User has SMS notifications enabled
- **And**: Current time is 11 PM (user's local timezone)
- **When**: Order status changes to "delivered"
- **Then**: Email and in-app notifications are sent immediately
- **And**: SMS notification is queued for 8 AM next day
- **And**: Analytics tracks "quiet hours queued" event
```

This format:
- Removes ambiguity
- Translates directly to test cases
- Covers edge cases explicitly
- Readable by non-technical stakeholders

### Quantify Everything Measurable

```
✅ Good: "95th percentile response time under 100ms"
✅ Good: "Support 10,000 concurrent connections"
✅ Good: "99.9% uptime (8.76 hours downtime/year)"
❌ Bad: "Fast response time"
❌ Bad: "Handle lots of users"
❌ Bad: "Highly available"
```

### Address Edge Cases and Error Scenarios

**Common oversight** (from multiple sources): Specs focus on happy path, ignore failures

```markdown
## Error Handling

### Scenario: Email provider returns 500 error
- First attempt fails → Wait 1 minute → Retry
- Second attempt fails → Wait 5 minutes → Retry
- Third attempt fails → Wait 15 minutes → Retry
- All retries exhausted → Move to dead letter queue → Alert on-call

### Scenario: User has invalid email address
- Validate format before queuing
- If invalid, log validation error
- Do NOT retry invalid addresses
- Update user record with validation failure timestamp
```

### Use Tables for Complex Requirements

**For configuration, states, or multi-dimensional requirements:**

```markdown
| Notification Type | Email | SMS | In-App | Push |
|-------------------|-------|-----|--------|------|
| Order Confirmed   | ✅    | ❌  | ✅     | ❌   |
| Payment Processed | ✅    | ❌  | ✅     | ❌   |
| Shipped           | ✅    | ✅  | ✅     | Future |
| Delivered         | ✅    | ✅  | ✅     | Future |
```

---

## The Constitution Layer

**Key Insight** (EPAM, GitHub): The constitution encodes "project DNA"—how your team builds

### What Goes in the Constitution

The constitution is **project-specific knowledge** that lives in code review comments, Slack threads, and past PRs. It gives AI agents the same guidance you'd give a senior hire on day one.

### Why This Matters

**Without a constitution:**
- AI generates "generic best practices" code
- Mismatches your patterns (e.g., uses Redux when you use React Query)
- Recreates existing functionality
- Violates security policies
- Uses banned dependencies

**With a constitution:**
- AI follows YOUR patterns
- Reuses YOUR existing utilities
- Respects YOUR architectural decisions
- Maintains consistency across the codebase

---

## Common Pitfalls to Avoid

Pitfalls come in two kinds and this list covers both.

**Pitfalls 1 to 8 are pitfalls of omission.** Something the implementer needs is missing, so they guess. Each one is fixed by adding.

**Pitfalls 9 to 12 are pitfalls of excess.** The requirement is present but buried, so the implementer has to search for it. Each one is fixed by cutting.

Neither kind is worse than the other. A spec nobody can find the requirement in fails the same way as a spec that never stated it. Read both halves before you decide a draft is finished, and apply the second half on **every revision**, not only on the first draft. A revision that only adds leaves the spec longer every time, and after three review passes the requirements are buried in the reasoning that produced them.

### 1. Over-Specifying Implementation Details

**Problem**: Constraining the "how" instead of the "what"

```
❌ Bad:
"Use a Redis queue with 3 worker processes running in Kubernetes pods,
each processing messages in batches of 10 using bull library"

✅ Good:
"Process notifications asynchronously with:
- At-least-once delivery guarantee
- Handle 10,000 notifications/minute
- Retry failed deliveries with exponential backoff"
```

**Lesson** (Thoughtworks, Red Hat): Specify outcomes and constraints; let the plan phase determine implementation.

### 2. Under-Specifying Edge Cases

**Problem**: Only covering the happy path

```
❌ Bad:
"Send email when order ships"

✅ Good:
"Send email when order ships:
- If email provider fails, retry 3 times (1min, 5min, 15min)
- If user email is invalid, log error and alert support
- If user has disabled email notifications, skip and log
- If order has multiple shipments, send one email per shipment
- Track email open/click events for analytics"
```

**Lesson** (Multiple sources): Edge cases and error scenarios are where implementations diverge most.

### 3. Ambiguous Language

**Problem**: "Weasel words" that allow multiple interpretations

```
❌ Bad:
"The system should be fast and handle reasonable load"

✅ Good:
"The system SHALL respond within 100ms (p95) under 10,000 concurrent requests"
```

**Avoid these words:** should, could, might, reasonable, appropriate, fast, slow, large, small

### 4. Ignoring Existing Patterns

**Problem**: Not providing context about the codebase

```
❌ Bad:
"Add user preferences"

✅ Good:
"Add user preferences:
- Extend existing UserService (backend/services/user/user.ts)
- Use existing preferences table schema pattern (see NotificationPreferences)
- Follow existing API pattern (GET/PUT /api/v2/users/:id/preferences)
- Reuse existing PreferenceManager helper class"
```

**Lesson** (EPAM, GitHub): AI doesn't know your codebase conventions without explicit guidance.

### 5. Specification Drift

**Problem**: Specs become outdated as implementation evolves

```
❌ Bad:
Write spec → Implement → Never update spec → Spec becomes fiction

✅ Good:
Write spec → Implement → Update spec based on learnings → Spec reflects reality
```

**Solution**: Treat specs as living documents. Version them. Update them when requirements change.

### 6. Skipping the "Why"

**Problem**: A non-obvious decision is stated with no reason, so the implementer cannot tell a real constraint from an arbitrary choice

```
❌ Bad (no reason, so the constraint looks arbitrary):
"Notifications must support retry with exponential backoff"

✅ Good (the reason, once, in one sentence):
"Notifications must support retry with exponential backoff. The provider
rate-limits immediate retries and fails transiently 5-10% of the time."
```

**Bound this rule three ways.** Unbounded, it is the largest single source of specification bloat, because it applies to every requirement and grows on every revision.

1. **Only where the reason is non-obvious.** A requirement whose reason any senior developer would infer needs no justification. "Passwords are hashed at rest" does not need a paragraph.
2. **One or two sentences.** If the reason needs more than that, it is a design decision rather than a note. Record it in `decisions.md` and reference it from here.
3. **Once, at the decision.** Never restate the reason where the decision is referenced. See pitfall 9.

```
❌ Also bad (the same requirement, over-justified):
"Notifications must support retry with exponential backoff because:
- Email providers have transient failures (5-10% rate)
- Immediate retries can trigger rate limits
- Business requires 99.9% delivery reliability
- User expectations: notifications arrive within 60 seconds"
```

Two of those four bullets are the reason. The other two are requirements in disguise: 99.9% delivery reliability and a 60-second delivery target are verifiable, so they belong in Non-Functional Requirements where a test can reach them. Justification is where requirements go to hide from verification.

**Lesson** (Augment Code, EPAM): The "why" helps AI make better implementation decisions and helps future developers understand context. An unbounded "why" buries the "what" it was meant to support.

### 7. Missing the "Do NOT" Section

**Problem**: AI makes reasonable but wrong assumptions

```
❌ Bad:
[No constraints listed]
→ AI implements push notifications, modifies User model, creates new microservice

✅ Good:
"DO NOT:
- Implement push notifications (deferred to Phase 2)
- Modify the User model (use UserPreferences table)
- Create new microservice (embed in existing NotificationService)"
```

**Lesson** (Zencoder, GitHub): Explicit constraints are as important as requirements.

### 8. Forgetting Non-Functional Requirements

**Problem**: Only specifying features, not qualities

```
❌ Bad:
[Lists features only]

✅ Good:
"Non-Functional Requirements:
- Performance: p95 latency under 100ms
- Scalability: Support 50,000 users
- Security: PII encrypted at rest
- Compliance: GDPR right-to-deletion
- Reliability: 99.9% uptime
- Observability: Full request tracing"
```

**Lesson**: Non-functional requirements often determine architecture more than functional requirements.

### 9. Explaining a Decision More Than Once

**Problem**: The rationale is repeated wherever the decision is referenced

```
❌ Bad (the same reason, restated at each of four sites):
§4  "Use ranked paging, because the predecessor lookup needs a stable window
     and offset paging shifts rows under it."
§7  "Paging is ranked, chosen because the predecessor lookup needs a stable
     window that offset paging would shift."
§9  "The list pages by rank. Offset paging would shift the window the
     predecessor lookup depends on."

✅ Good (stated once, referenced after):
§4  "Use ranked paging. The predecessor lookup needs a stable window (D4)."
§7  "Paging is ranked, per §4."
§9  "The list pages by rank, per §4."
```

**Lesson**: A reader who wants the reason follows one reference. A reader who wants the requirement should not have to read the reason three more times to reach it.

### 10. Padding a Requirement With Its Own Restatement

**Problem**: A second sentence says what the first one already said

```
❌ Bad:
"The modal SHALL list only entries referencing the opened record. This means
that entries referencing a different record of the same type are excluded, and
the listing is therefore scoped to the opened record rather than to the entity
type as a whole."

✅ Good:
"The modal SHALL list only entries referencing the opened record. Entries
referencing a different record of the same type are excluded."
```

**Lesson**: Cut any sentence that restates the one before it. Restatement reads as emphasis to the author and as a second, subtly different requirement to the implementer.

### 11. Keeping Superseded Text Beside Current Text

**Problem**: The spec argues with its earlier drafts inside the requirement

```
❌ Bad:
"Restructured per D36. v2.0.0 sequenced the epic horizontally, which left one
story last-enabling for seven test specs and roughly twenty criteria. D36
re-cuts the middle so a vertical skeleton lands early."

✅ Good:
"The epic is cut vertically. A skeleton lands first and every later story
carries its own test spec (D36)."
```

**Lesson**: A specification states the design that survived. Record the design that did not survive in `decisions.md`, not in the requirement. An implementer who reads the rejected shape can build it by mistake.

### 12. Keeping Closed Questions at Full Length

**Problem**: Resolved questions keep the space they earned while they were open

```
❌ Bad:
"### 17.2 Retention — CLOSED by D39
 [six paragraphs of options, objections, and the reasoning that closed it]"

✅ Good:
"| OQ-2 | Retention of legacy entries | RESOLVED 2026-09-04 — 90 days (D39) |"
```

**Lesson**: An open question earns room because somebody has to act on it. A closed one earns a line. Record the reasoning in `decisions.md`, with the decision it produced, not in the question it answered.

### 13. Naming a Concept That Already Has a Name

**Problem**: A spec invents new vocabulary for a unit of work `CATALOG_GUIDELINES.md` already names

```
❌ Bad:
"Restructure into ten seams, each under the 30-file budget. Seam 4 is the
last-enabling seam for the Cypress spec covering seams 1 through 3."

✅ Good:
"Restructure into ten stories, each under the 30-file budget. Story 4 is the
last-enabling story for the Cypress spec covering stories 1 through 3."
```

**Lesson**: A spec cuts an epic into budget-sized units. That unit is a story, defined in `CATALOG_GUIDELINES.md` and expanded on in `/mr-maps`'s Story Sizing Guideline. Reuse that name. A new synonym, such as "seam", "slice" or "chunk", reads as a new concept to every later reader. "Seam" is worse. It already names something else in software engineering: a point where behavior changes without editing the code there (Feathers).

---

## Verification and Testing

**Key Insight** (Zencoder): "Specifications without verification are just documentation"

### Test Pyramid for Specifications

```
      E2E Tests (5%)
    ─────────────────
   │ Complete user flows │
   │ Critical paths only │
    ─────────────────

  Integration Tests (25%)
  ─────────────────────────
 │ Service interactions    │
 │ Database + external APIs│
  ─────────────────────────

    Unit Tests (70%)
  ───────────────────────────
 │ Individual functions       │
 │ Business logic validation  │
 │ Acceptance criteria proofs │
  ───────────────────────────
```

---

## Living Specifications

A specification is a living document. Living means the current version is accurate. It does not mean the document accumulates.

Everything a spec no longer asserts belongs somewhere else, and there is already a place for each kind:

| What | Where it belongs | Why not in the spec |
|------|------------------|---------------------|
| Earlier versions of the document | git | The spec is committed at sign-off, so every earlier state is recoverable in full |
| Questions put to the user, and their answers | `question` tasks, in each task's `results` | Already structured and queryable. Prose in the spec is a second copy that drifts |
| Design decisions and the reasoning behind them | `decisions.md`, beside the spec | An implementer needs the decision. The argument that produced it has a different reader |
| Build progress | task statuses | A section marked IMPLEMENTED goes stale the moment a task moves |

The spec carries one thing: **the design as it stands now.** Not how it got there.

### The Decision Record

`decisions.md` sits beside the spec and holds the reasoning the spec does not carry.

| Goes in the spec | Goes in `decisions.md` |
|------------------|------------------------|
| The decision, stated as a requirement | Why that decision, at any length it needs |
| A one-or-two-sentence reason, where the reason is non-obvious | The options considered and why they lost |
| A `(D-N)` reference to the full reasoning | Reversals: what changed, and what it replaced |

The two documents have different readers. Everyone who builds from the spec needs the decision. Only a reviewer, and the author on the next revision, need the argument that produced it. So record what was decided in the spec, and record the argument that produced it in `decisions.md`.

Decisions recorded in `decisions.md` are never deleted. A reversal is a new entry naming the entry it supersedes. The spec then states only the design that now stands.

### When to Update Specifications

You never decide on your own to revise the spec. You are given a task that says to. What differs is what prompted that task, and that is what tells you which parts to change.

**Revise the spec when your task carries:**
- User feedback from spec review
- Critic findings from a critical review
- Answers to open questions the user has now resolved
- A superseding specification task, created when acceptance verification found that a criterion or the spec itself was wrong

Answering an open question is two edits, not one: fold the answer into the relevant requirement, and collapse the question's own entry to one line (pitfall 12). Do both in the same revision. Nothing reviews the spec for excess again before sign-off, so a question left at full length here stays that way.

In every case, change what the input actually calls for. Resist the pull to re-justify the surrounding text while you are in it. That is how a targeted revision turns into a longer document.

**Do not change the spec for:**
- Implementation details, which go in the plan
- Refactoring decisions, which are architectural notes
- Bug fixes that do not change a requirement
- Recording that something was built, which is what task status is for
- Recording that a decision was reversed, which is what `decisions.md` is for

### How Specifications Change After Sign-Off

The user signs the spec off and it is committed to git. After that the spec is not edited freely.

When verification shows that a criterion or the spec itself is wrong, the workflow escalates to the user, who decides whether to amend. An amendment creates **new superseding specification, plan and verification tasks**. It is not a silent in-place edit, so the change is visible in the task tree as well as in git.

This is why a spec needs no deviation log. A deviation that mattered enough to act on produced tasks, and those tasks are the record. A deviation that produced no tasks was not a deviation.

---

## Quick Reference: Specification Checklist

Use this checklist before finalizing any specification:

### Completeness
- [ ] User story clearly defines who, what, and why
- [ ] Acceptance criteria are verifiable, each with a stable ID (AC-N), a name, and an owner (MAPS or User)
- [ ] Open questions each have a stable ID (OQ-N) and a short name
- [ ] All functional requirements listed by capability area, each with a stable ID (FR-N)
- [ ] Non-functional requirements cover performance, security, reliability
- [ ] Explicit constraints (DO NOTs) clearly listed, each with a stable ID (DO-NOT-N)
- [ ] Technical context explains integration points
- [ ] Every acceptance criterion is verified by at least one acceptance test
- [ ] Every acceptance test has a stable ID (AT-N) and lists the criteria it Verifies and its Method
- [ ] Owners are consistent with methods (any User-method test ⇒ that criterion is User-owned)
- [ ] Production-only outcomes are in Success Metrics, not Acceptance Criteria (dev-time proxy ACs cross-referenced where they exist)
- [ ] Dependencies identified (upstream and downstream)
- [ ] Risks documented with mitigations, each with a stable ID (RISK-N)
- [ ] Out of scope explicitly stated

### Clarity
- [ ] Another senior developer could implement without clarification
- [ ] Active, specific language (SHALL, MUST, not "should", "might")
- [ ] No ambiguous terms (fast, slow, reasonable)
- [ ] Edge cases and error scenarios covered
- [ ] Quantitative metrics where applicable (95th percentile, 60 seconds)
- [ ] Given/When/Then format for user workflows
- [ ] Examples provided for complex requirements

### Context
- [ ] Constitution referenced for architectural patterns
- [ ] Existing systems and services identified
- [ ] Current patterns and conventions respected
- [ ] "Why" explained for non-obvious requirements, in one or two sentences, stated once (pitfall 6)
- [ ] Related specifications linked

### AI-Readiness
- [ ] Structured format (headings, lists, tables)
- [ ] Each acceptance criterion has a defined verification path (test + method)
- [ ] Clear separation of "what" vs "how"
- [ ] Examples and patterns provided
- [ ] Verification approach defined

### Concision

Run this group last, after the other four confirm the spec is complete. You cannot cut what you have not finished writing. Run it again on every revision, because a revision that only adds leaves the spec longer every time.

- [ ] No decision is explained in more than one place (pitfall 9)
- [ ] No sentence restates the sentence before it (pitfall 10)
- [ ] Rejected options and superseded designs are out of the requirements (pitfall 11)
- [ ] Closed questions are one line each (pitfall 12)
- [ ] Version History cells are one line each, naming what changed and not why
- [ ] Every section that grew during this revision was re-read for restatement
- [ ] This revision cut something, or you confirmed there was nothing to cut

---

## Conclusion

Effective specifications are the foundation of successful AI-assisted development. They:

1. **Serve humans first** - Clear enough for team understanding and alignment
2. **Guide AI agents** - Structured enough for automated implementation
3. **Prevent waste** - Reduce rework by front-loading decisions
4. **Preserve knowledge** - Capture the "why" once, in `decisions.md`
5. **Enable verification** - Map directly to acceptance tests
6. **Stay living** - Evolve with implementation learnings

**Key Lessons from the Research:**

- **Specification is hard** (Sogl, Böckeler) - Don't underestimate the effort
- **Constitution matters** (EPAM, GitHub) - Project DNA guides AI agents
- **Edge cases count** (Multiple sources) - Happy path is never enough
- **Tests prove specs** (Zencoder) - Verification makes specs executable
- **Context is king** (Augment Code, Red Hat) - Integration knowledge is critical
- **Living not dead** (All sources) - Specs must evolve with understanding


Start with the full template for production features. Simplify for prototypes. Always update specs when reality diverges from plans.

**Good specifications are worth the investment—they pay dividends throughout implementation and beyond.**
