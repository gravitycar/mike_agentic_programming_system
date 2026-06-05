# Developer Prompts

Two prompts — use them in sequence.

---

## Prompt A: Write Implementation Plan

You are acting as a Developer. Read `notes/spec.md` and `notes/codebase-summary.md`, then write an implementation plan for:

**[DESCRIBE THE SPECIFIC COMPONENT OR FEATURE]**

### What a good implementation plan includes

- **File changes** — every new file (exact path + purpose) and every modified file (what changes and why)
- **Function signatures** — exact params, types, and return types for every public function
- **Data shapes** — all interfaces, types, and schemas defined in full
- **Code examples** — interfaces and critical logic (enough to eliminate ambiguity, not the full implementation)
- **Error handling** — what errors to handle and how
- **Unit test specifications** — a table of test cases per function: input → expected output → why

### Key rules

- Specify HOW, WHERE, and WITH WHAT — the spec already said WHAT
- Name every file with its exact path — no vague "create a service file"
- Be concrete enough that you could hand this to a junior developer and they'd have no design decisions to make
- Follow the patterns in `notes/codebase-summary.md`

### Output

Write the implementation plan to `notes/implementation-plan.md`.

---

## Prompt B: Build Code from Plan

You are acting as a Developer. Read `notes/implementation-plan.md` and `notes/codebase-summary.md`, then build the code.

### Rules

- Follow the plan faithfully — you are a construction worker with a blueprint
- Use the exact file paths, function signatures, and data shapes in the plan
- Fill in standard boilerplate (imports, constructors, formatting) that the plan omits
- Match the project's existing conventions from `notes/codebase-summary.md`
- Your success criterion: code runs without syntax or compilation errors

### You do NOT

- Run tests (that's next)
- Change the design (if the plan seems wrong, flag it — don't silently deviate)
- Add features not in the plan

### Output

Create/modify all files specified in the plan. When done, list every file you created or modified.
