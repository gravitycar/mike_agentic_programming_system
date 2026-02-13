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
7. [Specification Templates](#specification-templates)
8. [Verification and Testing](#verification-and-testing)
9. [Living Specifications](#living-specifications)

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

The specification defines success criteria; the plan phase determines technical approach.

### 3. Explicit Constraints Are Critical

**Key Insight** (Zencoder, EPAM): "What NOT to build" is as important as what to build

```markdown
## Explicit Constraints (DO NOT)
- Do NOT implement push notifications (Phase 2 feature)
- Do NOT modify the existing User model
- Do NOT create a separate microservice (embed in monolith)
- Do NOT build custom email service (use Resend)
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

## Success Criteria
[Measurable outcomes that define success - must be verifiable]

1. **[Metric Name]**: [Specific threshold, e.g., "95% delivered within 60 seconds"]
2. **[Impact Measure]**: [Business outcome, e.g., "40% reduction in support tickets"]
3. **[Quality Gate]**: [Technical threshold, e.g., "99.9% uptime"]

## Context and Problem Statement
[Why are we building this? What problem does it solve? What happens if we don't?]

### Current State
[How things work today, including pain points]

### Desired State
[How things should work after implementation]

## Functional Requirements

### Core Capabilities
[What the system must do - organized by capability area]

#### [Capability Area 1]
- Requirement 1
- Requirement 2
- Edge cases and exceptions

#### [Capability Area 2]
- Requirement 1
- Requirement 2

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

- Do NOT [constraint with reasoning]
- Do NOT [constraint with reasoning]
- Must NOT [constraint with reasoning]

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

✅ **Test scenarios that prove the feature works**

1. **Test Name**: [Clear description]
   - **Setup**: [Preconditions]
   - **Action**: [What to do]
   - **Expected**: [What should happen]
   - **Success Criteria**: [How to measure]

2. **Test Name**: ...

## Dependencies

### Upstream Dependencies
[What must exist before this can be built]

### Downstream Impact
[What will be affected by this change]

### External Dependencies
[Third-party services, APIs, libraries]

## Risks and Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| [Risk description] | High/Med/Low | High/Med/Low | [How to address] |

## Out of Scope

**Explicitly not included in this specification:**

- [Feature that might be assumed but isn't included]
- [Related work deferred to future phases]
- [Alternative approaches considered but rejected]

## Open Questions

[Unresolved decisions that need stakeholder input]

1. **Question**: [What needs to be decided?]
   - **Options**: [Alternatives being considered]
   - **Decision by**: [Date or milestone]

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

| Version | Date | Author | Changes |
|---------|------|--------|---------|
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

**Problem**: Specifying what without explaining why

```
❌ Bad:
"Notifications must support retry with exponential backoff"

✅ Good:
"Notifications must support retry with exponential backoff because:
- Email providers have transient failures (5-10% rate)
- Immediate retries can trigger rate limits
- Business requires 99.9% delivery reliability
- User expectations: notifications arrive within 60 seconds"
```

**Lesson** (Augment Code, EPAM): The "why" helps AI make better implementation decisions and helps future developers understand context.

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

---

## Verification and Testing

**Key Insight** (Zencoder): "Specifications without verification are just documentation"

### Link Specs to Tests

Every acceptance criterion should map to a test:

```markdown
## Acceptance Criteria

1. **Email delivery speed**: 95% delivered within 60 seconds
   → Test: `test/notifications/email-delivery-speed.test.ts`

2. **Quiet hours respected**: SMS queued during quiet hours
   → Test: `test/notifications/sms-quiet-hours.test.ts`

3. **Retry logic**: 3 attempts with exponential backoff
   → Test: `test/notifications/retry-logic.test.ts`
```

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

### Acceptance Test Format

```typescript
describe('Notification System - Specification v1.2.0', () => {
  describe('Acceptance Criterion: Email delivery within 60 seconds', () => {
    it('delivers 95% of emails within 60 seconds under load', async () => {
      // Arrange
      const notifications = generateTestNotifications(1000);

      // Act
      const results = await Promise.all(
        notifications.map(n => measureDeliveryTime(n))
      );

      // Assert
      const p95 = percentile(results, 95);
      expect(p95).toBeLessThan(60_000); // 60 seconds
    });
  });

  describe('Acceptance Criterion: Quiet hours respected', () => {
    it('queues SMS during quiet hours, sends immediately after', async () => {
      // Arrange
      setSystemTime('23:00'); // 11 PM
      const user = await createUserWithPreferences({
        smsEnabled: true,
        quietHoursStart: '22:00',
        quietHoursEnd: '08:00',
      });

      // Act
      await triggerNotification(user, 'order_delivered');

      // Assert
      const smsStatus = await getSMSStatus(user);
      expect(smsStatus.sent).toBe(false);
      expect(smsStatus.queuedFor).toBe('08:00');

      // Advance time to 8 AM
      setSystemTime('08:00');
      await processQueue();

      const smsAfterQuietHours = await getSMSStatus(user);
      expect(smsAfterQuietHours.sent).toBe(true);
    });
  });
});
```

---

## Living Specifications

**Key Insight** (Multiple sources): Specs must evolve with understanding

### Version Control Specifications

```markdown
# Notification System Specification

**Version**: 1.2.0
**Status**: Approved

## Version History

| Version | Date | Author | Changes | Rationale |
|---------|------|--------|---------|-----------|
| 1.2.0 | 2024-02-15 | Alice | Added SMS quiet hours | User feedback: nighttime SMS complaints |
| 1.1.0 | 2024-01-20 | Bob | Clarified retry intervals | Implementation revealed ambiguity |
| 1.0.0 | 2024-01-01 | Alice | Initial specification | New feature kickoff |
```

### When to Update Specifications

**Update specs when:**
- Requirements change based on user feedback
- Implementation reveals ambiguities or contradictions
- Edge cases discovered during development
- Performance targets adjusted based on reality
- New constraints discovered (e.g., third-party API limits)

**Don't update specs for:**
- Implementation details (those go in the plan)
- Refactoring decisions (architectural notes)
- Bug fixes that don't change requirements

### Spec Review Cadence

**During implementation:**
- Review spec at start of each work session
- Update spec when discovering ambiguities
- Mark sections "IMPLEMENTED" as work completes

**After implementation:**
- Final spec update reflecting "as-built" reality
- Document deviations from original spec with rationale
- Archive spec with implementation PR for future reference

---

## 

## Quick Reference: Specification Checklist

Use this checklist before finalizing any specification:

### Completeness
- [ ] User story clearly defines who, what, and why
- [ ] Success criteria are measurable and verifiable
- [ ] All functional requirements listed by capability area
- [ ] Non-functional requirements cover performance, security, reliability
- [ ] Explicit constraints (DO NOTs) clearly listed
- [ ] Technical context explains integration points
- [ ] Acceptance tests map to success criteria
- [ ] Dependencies identified (upstream and downstream)
- [ ] Risks documented with mitigations
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
- [ ] "Why" explained for non-obvious requirements
- [ ] Related specifications linked

### AI-Readiness
- [ ] Structured format (headings, lists, tables)
- [ ] Executable acceptance criteria
- [ ] Clear separation of "what" vs "how"
- [ ] Examples and patterns provided
- [ ] Verification approach defined

---

## Conclusion

Effective specifications are the foundation of successful AI-assisted development. They:

1. **Serve humans first** - Clear enough for team understanding and alignment
2. **Guide AI agents** - Structured enough for automated implementation
3. **Prevent waste** - Reduce rework by front-loading decisions
4. **Preserve knowledge** - Capture the "why" for future teams
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
