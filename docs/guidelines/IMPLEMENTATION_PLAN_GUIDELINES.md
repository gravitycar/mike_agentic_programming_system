# Implementation Plan Guidelines for AI-Assisted Development

This guide defines how to write effective implementation plans within the MAPS workflow. Where the specification defines **what** to build and **why**, the implementation plan defines **how** — with enough detail that the Developer agent can build working code in a single pass without ambiguity.

---

## Table of Contents

1. [Core Principles](#core-principles)
2. [Relationship to Other Documents](#relationship-to-other-documents)
3. [Implementation Plan Structure](#implementation-plan-structure)
4. [Writing Effective Plans](#writing-effective-plans)
5. [Code Examples](#code-examples)
6. [Unit Test Specifications](#unit-test-specifications)
7. [Handling Dependencies](#handling-dependencies)
8. [Common Pitfalls to Avoid](#common-pitfalls-to-avoid)
9. [Sizing and Decomposition](#sizing-and-decomposition)
10. [Quick Reference Checklist](#quick-reference-checklist)

---

## Core Principles

### 1. Plans Are Build Instructions, Not Design Documents

The specification captures requirements and design intent. The implementation plan is a construction blueprint — it tells the Developer exactly what to build, where to put it, and how the pieces connect.

```
Specification:  "The system SHALL authenticate users via JWT tokens"
                → Defines WHAT and WHY

Implementation: "Create auth.ts in src/middleware/ exporting a verifyToken()
                function that extracts the Bearer token from the Authorization
                header, verifies it using jsonwebtoken.verify() with the secret
                from process.env.JWT_SECRET, and attaches the decoded payload
                to req.user"
                → Defines HOW, WHERE, and WITH WHAT
```

A good plan is one that a Developer can follow mechanically. If the Developer needs to make design decisions while building, the plan is underspecified.

### 2. Concrete Over Abstract

Plans should be specific. Name the files, name the functions, show the signatures, show the data shapes. Abstract descriptions create ambiguity; concrete examples eliminate it.

```
❌ Abstract: "Implement a service that handles user creation"

✅ Concrete: "Create UserService class in src/services/user-service.ts with method:
   async createUser(input: CreateUserInput): Promise<User>
   - Validate input using validateCreateUser() from src/validators/user.ts
   - Hash password using bcrypt with 12 rounds
   - Insert into users table via db.insert(users).values(...)
   - Return the created User (without password hash)"
```

### 3. One Catalog Item, One Plan

Each implementation plan maps to exactly one item from the implementation catalog. The catalog item defines the scope boundary — the plan should not drift beyond it. If the plan discovers that the catalog item was scoped too broadly, that's a signal the catalog item needs decomposition, not that the plan should grow unbounded.

### 4. The Plan Is the Source of Truth for Build

During step 15 (Build), the Developer follows the implementation plan faithfully. The Developer does not reinterpret the spec or make independent design decisions — it builds what the plan says. This is why the plan must be detailed enough to build from without ambiguity. The Critic validates plan completeness in step 13 before any code is written.

### 5. Include Context, But Don't Duplicate the Spec

Every plan should orient the reader to the larger picture — which spec requirement it fulfills, how it fits within the broader architecture. But the plan should reference the spec, not restate it. A brief summary of the relevant spec context is sufficient. The full specification is always available via `artifact_list`.

---

## Relationship to Other Documents

Understanding where the plan sits in the document chain prevents duplication and gaps:

```
Research Summaries → Specification → Implementation Catalog → Implementation Plans
   (what exists)     (what to build)    (what the pieces are)   (how to build each piece)
```

| Document | Answers | Level of Detail |
|----------|---------|-----------------|
| **Research summary** | "What exists in the codebase and domain?" | Survey-level |
| **Specification** | "What should the system do and why?" | Requirements-level (no code) |
| **Implementation catalog** | "What are the discrete buildable units?" | List-level (no code, max ~3 files each) |
| **Implementation plan** | "How exactly do we build this unit?" | Code-level (file paths, signatures, examples) |

The specification says "The system SHALL send email notifications within 60 seconds." The catalog says "Item 3: Email notification sender service (2 files)." The plan says "Create `EmailSender` class in `src/services/email-sender.ts` with `async send(notification: Notification): Promise<SendResult>` method that calls the Resend API, implements exponential backoff retry..."

---

## Implementation Plan Structure

### Recommended Template

```markdown
# Implementation Plan: [Catalog Item Name]

## Spec Context
[2-3 sentences summarizing the relevant specification requirement and this plan's
role in the broader implementation. Reference the spec section, not restate it.]

Catalog item: [Name from catalog]
Specification section: [Which section(s) of the spec this fulfills]
Acceptance criteria addressed: [List the specific criteria from the spec]

## Dependencies
- **Blocked by**: [Other catalog items/plans that must be built first]
- **Blocks**: [Other catalog items/plans that depend on this]
- **Uses**: [Existing code, libraries, services this depends on]

## File Changes

### New Files
- `path/to/new-file.ts` — [Purpose]
- `path/to/another-file.ts` — [Purpose]

### Modified Files
- `path/to/existing-file.ts` — [What changes and why]

## Implementation Details

### [Component/Class/Module Name]

[Detailed description of what to build. Include:]

**File**: `src/path/to/file.ts`

**Exports**:
- `functionName(param: Type): ReturnType` — [What it does]
- `ClassName` — [What it represents]

**Code Example**:
```typescript
// Show the key implementation — function signatures, class structure,
// data shapes, critical logic. Not every line of code, but enough
// to eliminate ambiguity about the approach.

export interface CreateUserInput {
  email: string;
  password: string;
  name: string;
}

export class UserService {
  constructor(private db: Database) {}

  async createUser(input: CreateUserInput): Promise<User> {
    const validated = validateCreateUser(input);
    const passwordHash = await bcrypt.hash(validated.password, 12);
    const [user] = await this.db
      .insert(users)
      .values({ ...validated, password: passwordHash })
      .returning();
    return omit(user, ['password']);
  }
}
```

### [Next Component]

[Continue for each component in this plan...]

## Error Handling

[How errors are handled in this plan's code. Be specific:]
- [Error condition] → [What happens]
- [Error condition] → [What happens]

## Unit Test Specifications

### Test File: `tests/path/to/file.test.ts`

| Test Case | Setup | Action | Expected Result |
|-----------|-------|--------|-----------------|
| [Name] | [Preconditions] | [What to call] | [What should happen] |
| [Name] | [Preconditions] | [What to call] | [What should happen] |

### Key Test Scenarios

1. **[Happy path scenario]**
   - Setup: [What to arrange]
   - Call: `functionName(validInput)`
   - Expect: [Specific return value or behavior]

2. **[Edge case scenario]**
   - Setup: [What to arrange]
   - Call: `functionName(edgeCaseInput)`
   - Expect: [Specific return value or behavior]

3. **[Error scenario]**
   - Setup: [What to arrange]
   - Call: `functionName(invalidInput)`
   - Expect: [Specific error type or behavior]

## Notes

[Any additional context the Developer needs — gotchas, performance considerations,
patterns to follow from elsewhere in the codebase, etc.]
```

---

## Writing Effective Plans

### Name Every File

The Developer should never need to decide where to put code. Every new file and every modified file should be listed with its full path relative to the project root.

```
❌ Vague: "Create a service for handling payments"

✅ Explicit:
### New Files
- `src/services/payment-service.ts` — PaymentService class
- `src/types/payment.ts` — Payment-related type definitions
- `src/validators/payment.ts` — Input validation for payment operations

### Modified Files
- `src/routes/api.ts` — Add payment routes
- `src/types/index.ts` — Re-export payment types
```

### Show Function Signatures

Every public function, method, or API endpoint should have its full signature. The Developer should never need to guess parameter names, types, or return types.

```
❌ Vague: "Add a method to process refunds"

✅ Explicit:
async processRefund(
  orderId: string,
  amount: number,
  reason: RefundReason
): Promise<RefundResult>

Where:
- RefundReason = 'defective' | 'wrong_item' | 'changed_mind' | 'other'
- RefundResult = { refundId: string; status: 'pending' | 'completed'; amount: number }
```

### Define Data Shapes

When the plan introduces new data structures — interfaces, types, database records, API payloads — define them explicitly. Data shapes are where misunderstandings breed bugs.

```typescript
// Define the shape, don't just describe it
export interface Notification {
  id: string;
  userId: string;
  type: 'email' | 'sms' | 'in_app';
  channel: NotificationChannel;
  payload: {
    subject: string;
    body: string;
    metadata?: Record<string, string>;
  };
  status: 'pending' | 'sent' | 'failed' | 'retrying';
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  sentAt: Date | null;
}
```

### Describe Behavior at Boundaries

Where components connect — function calls, API boundaries, database operations, file I/O — describe the contract precisely. What goes in, what comes out, what happens on failure.

```
❌ Vague: "The service calls the database to save the record"

✅ Precise:
Insert into `notifications` table using:
  db.insert(notifications).values(notification).returning()

On unique constraint violation (duplicate notification ID):
  → Throw NotificationExistsError with the existing notification's ID

On database connection error:
  → Let the error propagate (caller handles retries)
```

### Reference Existing Code Patterns

When the project already has established patterns, point to them. The Developer should follow existing conventions, not invent new ones.

```
✅ Good:
"Follow the same service pattern as UserService (src/services/user-service.ts):
- Constructor takes Database instance
- Methods are async, return Promise<T>
- Validation happens before database operations
- Use the existing AppError base class for domain errors"
```

In brownfield projects, this is critical. The codebase has conventions for error handling, logging, database access, configuration, and file organization. The plan should make these conventions explicit for each new component.

### Specify Import Relationships

When files import from each other, say so. When a new file depends on an existing utility, library, or type, list the import.

```
✅ Good:
"payment-service.ts imports:
- Database type from src/db/index.ts
- PaymentInput, RefundInput from src/types/payment.ts
- validatePayment from src/validators/payment.ts
- AppError from src/errors/app-error.ts
- Stripe from 'stripe' (existing dependency in package.json)"
```

This prevents the Developer from importing the wrong module or missing a dependency.

---

## Code Examples

Code examples are the most valuable part of an implementation plan. They are expected and encouraged — unlike the specification, which deliberately avoids code.

### What to Show

Show enough code to eliminate ambiguity. Focus on:

1. **Interfaces and types** — the data shapes that define contracts
2. **Function/method signatures** — the public API of each component
3. **Critical logic** — the non-obvious parts where mistakes are likely
4. **Integration points** — how this code connects to other components

### What Not to Show

Don't write the entire implementation. The plan is a blueprint, not a finished codebase. Skip:

1. **Boilerplate** — imports, trivial getters/setters, standard error classes
2. **Obvious implementations** — if the function signature makes the body self-evident, don't spell out the body
3. **Framework plumbing** — standard Express middleware chains, standard React component lifecycle

### Example: Right Level of Detail

```typescript
// SHOW: The interface (defines the contract)
export interface TaskRepository {
  create(task: CreateTaskInput): Promise<Task>;
  findById(id: number): Promise<Task | null>;
  update(id: number, changes: Partial<Task>): Promise<Task>;
  listByStatus(status: TaskStatus, epicId: number): Promise<Task[]>;
}

// SHOW: Critical logic (non-obvious business rules)
async function cascadeUnblock(completedTaskId: number, db: Database): Promise<void> {
  // Find all tasks blocked by the completed task
  const dependents = await db
    .select()
    .from(blockers)
    .where(eq(blockers.blockedByTaskId, completedTaskId));

  for (const dep of dependents) {
    // Check if ALL blockers for this task are now done
    const remainingBlockers = await db
      .select()
      .from(blockers)
      .innerJoin(tasks, eq(blockers.blockedByTaskId, tasks.id))
      .where(
        and(
          eq(blockers.blockedTaskId, dep.blockedTaskId),
          ne(tasks.status, 'done')
        )
      );

    if (remainingBlockers.length === 0) {
      await db
        .update(tasks)
        .set({ status: 'open', updatedAt: new Date() })
        .where(eq(tasks.id, dep.blockedTaskId));
    }
  }
}

// SKIP: Trivial CRUD that the signature already explains
// (Don't write out the body of findById — it's obvious from the signature)
```

### Language and Framework Alignment

Code examples should use the project's actual language, framework, and libraries. If the project uses TypeScript with Drizzle ORM, show Drizzle queries. If the project uses Python with SQLAlchemy, show SQLAlchemy queries. Never show generic pseudo-code when real code would be clearer.

```
❌ Bad: "Query the database for the user record using the ORM"
✅ Good: "const user = await db.select().from(users).where(eq(users.id, userId));"
```

---

## Unit Test Specifications

Every implementation plan should specify the unit tests that will verify the code. These test specs serve two purposes:

1. **Guide the Developer** during build — knowing the tests helps write testable code
2. **Guide the Test Writer** in step 16 — the test specs become the starting point for writing actual tests

### What to Specify

For each public function, method, or behavior:

1. **Happy path** — valid input produces expected output
2. **Edge cases** — boundary values, empty inputs, maximum sizes
3. **Error cases** — invalid input, missing dependencies, failure conditions
4. **State transitions** — if the function changes state, verify before and after

### Format

Use a table for concise test case lists, and expand key scenarios with setup/action/expect detail.

```markdown
## Unit Test Specifications

### `UserService.createUser()`

| Case | Input | Expected | Why |
|------|-------|----------|-----|
| Valid creation | Valid email, password, name | Returns User without password hash | Happy path |
| Duplicate email | Email that already exists | Throws UserExistsError | Unique constraint |
| Invalid email | "not-an-email" | Throws ValidationError | Input validation |
| Short password | 3-char password | Throws ValidationError("min 8 chars") | Business rule |
| SQL injection | `'; DROP TABLE users;--` as name | Safely escaped, user created | Security |

### Key Scenario: Duplicate Email

**Setup**: Insert a user with email "alice@example.com" into the database
**Action**: Call `createUser({ email: "alice@example.com", ... })`
**Expected**: Throws `UserExistsError` with message containing the email
**Verify**: No new row was inserted (user count unchanged)
```

### Mocking Guidance

When a component depends on external services, databases, or other modules, specify what should be mocked and how.

```markdown
### Mocking Strategy

- **Database**: Use an in-memory SQLite instance with the same schema
- **Stripe API**: Mock the `stripe.refunds.create()` method
- **Email service**: Mock `emailSender.send()` to capture the sent payload
- **Time**: Use fake timers for retry delay testing

Do NOT mock: internal validators, type converters, or pure utility functions
```

---

## Handling Dependencies

### Between Plans

When one plan depends on code from another plan, state this explicitly. The dependency becomes a blocker relationship in the task tree.

```markdown
## Dependencies

- **Blocked by**: "Database schema and migrations" plan — this plan's
  code imports from `src/db/schema.ts` which that plan creates
- **Blocks**: "API endpoint handlers" plan — that plan imports
  UserService from this plan
```

Be specific about what the dependency provides. "Blocked by the database plan" is less useful than "Blocked by the database plan — needs the `users` table schema and the `db` instance export from `src/db/index.ts`."

### On Existing Code

When the plan modifies or extends existing code, call out exactly what exists and what changes.

```markdown
### Modified File: `src/routes/api.ts`

**Currently**: Exports a router with routes for /users and /products
**Change**: Add import of paymentRouter from ./payment-routes.ts
           Add `router.use('/payments', paymentRouter)` after the products route
**Reason**: Wire the new payment endpoints into the existing API router
```

### On External Libraries

If the plan introduces a new dependency (npm package, Python library, etc.), state it clearly.

```markdown
### New Dependencies
- `stripe@14.x` — Payment processing SDK (add via `npm install stripe`)
- `@types/stripe` — TypeScript definitions (add via `npm install -D @types/stripe`)

No other new dependencies. Uses existing: express, drizzle-orm, zod.
```

---

## Common Pitfalls to Avoid

### 1. Describing Instead of Specifying

**Problem**: The plan reads like a high-level design document instead of build instructions.

```
❌ Vague:
"The authentication module should handle user login and session management.
It should validate credentials and return appropriate tokens."

✅ Concrete:
"File: src/auth/login.ts

Export: async function login(email: string, password: string): Promise<LoginResult>

Steps:
1. Query user by email: db.select().from(users).where(eq(users.email, email))
2. If no user found → throw AuthError('invalid_credentials')
3. Compare password: await bcrypt.compare(password, user.passwordHash)
4. If mismatch → throw AuthError('invalid_credentials')
5. Generate JWT: jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' })
6. Return { token, user: omit(user, ['passwordHash']) }

LoginResult = { token: string; user: Omit<User, 'passwordHash'> }"
```

### 2. Missing File Paths

**Problem**: The plan says what to build but not where to put it.

```
❌ Bad: "Create a payment service with processPayment and processRefund methods"
✅ Good: "Create src/services/payment-service.ts with..."
```

The Developer should never need to decide on file placement. If the project has an established structure (e.g., `src/services/` for services, `src/types/` for types), follow it. If not, choose a convention and state it in the plan.

### 3. Skipping Error Handling

**Problem**: The plan covers the happy path and leaves error behavior implicit.

```
❌ Bad:
"Call the Stripe API to create a charge"

✅ Good:
"Call stripe.charges.create(chargeParams)

On success: Return { chargeId: charge.id, status: 'completed' }
On StripeCardError: Return { chargeId: null, status: 'declined', reason: error.message }
On StripeRateLimitError: Throw RetryableError (caller retries)
On StripeAuthenticationError: Throw ConfigurationError (fatal — bad API key)
On network error: Throw RetryableError"
```

Error handling is where implementations silently diverge from the spec. If the plan doesn't specify it, the Developer will guess — and different guesses produce inconsistent behavior.

### 4. Code Examples That Don't Match the Stack

**Problem**: Showing pseudo-code or code in a different framework than the project uses.

```
❌ Bad (project uses Drizzle, example shows raw SQL):
"Run: SELECT * FROM users WHERE email = $1"

✅ Good (matches the actual stack):
"const user = await db.select().from(users).where(eq(users.email, email));"
```

The Developer builds literally from the plan. If the code example uses the wrong library or syntax, the Developer will either reproduce the mismatch or have to improvise — both outcomes the plan should prevent.

### 5. Overlooking Existing Utilities

**Problem**: The plan describes building something that already exists in the codebase.

```
❌ Bad: "Create a utility function to hash passwords using bcrypt"
       (when src/utils/crypto.ts already exports hashPassword())

✅ Good: "Use the existing hashPassword() from src/utils/crypto.ts"
```

The Researcher analyzed the codebase in step 2. The plan should leverage that research. Before specifying new code, check whether the functionality already exists. The plan should reference existing utilities, not reinvent them.

### 6. Too Much or Too Little Detail

**Problem**: Either spelling out every line of code (the plan becomes the codebase) or staying too high-level (the plan becomes another spec).

**Too much**: Writing out every import statement, every closing brace, every trivial getter. The plan becomes unreadable and the Developer gains nothing they couldn't derive from the structure and signatures.

**Too little**: "Create the email service." The Developer has no guidance on structure, approach, or edge cases.

**Right level**: Show the interfaces, function signatures, critical logic, data shapes, and error handling. Skip the boilerplate. The Developer can fill in trivial implementation details — the plan should cover everything non-trivial.

### 7. Ignoring the Revision Path

**Problem**: Writing plans that are hard to revise when tests fail.

Plans should be structured so that individual components can be revised without rewriting the entire document. When the Reviser updates a plan after a test failure, it should be able to change the relevant section without disturbing the rest.

```
✅ Good structure: Separate sections per component, with clear boundaries
❌ Bad structure: One long narrative where each section depends on details from the previous paragraph
```

### 8. Forgetting to Specify Test Infrastructure

**Problem**: Specifying test cases but not how to set up the test environment.

```
❌ Bad:
"Test that createUser handles duplicate emails"
(How? With what database? What test framework? What setup/teardown?)

✅ Good:
"Test framework: vitest (already configured in project)
Test database: in-memory SQLite via better-sqlite3, schema applied in beforeAll
Teardown: db.close() in afterAll, table truncation in beforeEach

Test: duplicate email handling
  beforeEach: insert user with email 'alice@example.com'
  action: call createUser({ email: 'alice@example.com', ... })
  expect: throws UserExistsError"
```

---

## Sizing and Decomposition

### The 10K Token Limit

Implementation plans have a hard limit of 10,000 tokens. This is not arbitrary — it ensures plans can fit in Claude's context window alongside the specification, test results, and other working documents.

### When a Plan Is Too Large

If a plan exceeds 10K tokens, the catalog item it maps to is scoped too broadly. The fix is upstream: decompose the catalog item into smaller items, each with its own plan.

**Signs a plan needs decomposition:**
- More than 3 files created or modified
- Multiple unrelated components in a single plan
- The plan covers both a data layer and a presentation layer
- The code examples alone exceed 5K tokens

**How to decompose:**
1. Identify natural boundaries (data layer vs. service layer vs. route handlers)
2. Each boundary becomes a separate catalog item
3. Add blocker relationships to preserve build order
4. Each new catalog item gets its own plan

### When a Plan Is Too Small

A plan that's only a few hundred tokens may be at the right level of detail for a trivial change — but if it's small because it's vague, it needs more detail. The test is: could the Developer build working code from this plan alone? If not, it's underspecified, not concise.

---

## Quick Reference: Implementation Plan Checklist

Use this checklist before finalizing any implementation plan:

### Completeness
- [ ] Every new file has a full path and purpose
- [ ] Every modified file lists what changes and why
- [ ] All public functions have full signatures (params, types, returns)
- [ ] All new data shapes (interfaces, types, schemas) are defined
- [ ] Error handling is specified for each component
- [ ] Dependencies on other plans are listed with specific details (what they provide)
- [ ] New external dependencies (packages, libraries) are listed

### Buildability
- [ ] A Developer could build working code from this plan without design decisions
- [ ] Code examples use the project's actual language, framework, and libraries
- [ ] Existing codebase patterns are referenced (not reinvented)
- [ ] Import relationships between new files are specified
- [ ] Integration points with existing code are explicit

### Testability
- [ ] Unit test specifications cover happy path, edge cases, and error cases
- [ ] Test file paths are specified
- [ ] Mocking strategy is defined for external dependencies
- [ ] Each test case has clear setup, action, and expected result
- [ ] Every acceptance criterion from the spec has at least one corresponding test case

### Context
- [ ] Spec context section summarizes the relevant requirement (2-3 sentences)
- [ ] Acceptance criteria addressed are listed
- [ ] Plan stays within the scope of its catalog item (no scope creep)
- [ ] Plan is under 10K tokens

### Reviewability
- [ ] Plan is structured in discrete sections that can be revised independently
- [ ] Component boundaries are clear
- [ ] The Critic can compare each section against the spec to validate completeness
