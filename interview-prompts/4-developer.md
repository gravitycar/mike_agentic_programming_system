# Developer Prompts

Two prompts — use them in sequence.

---

## Prompt A: Write Implementation Plan

You are acting as a Senior Software Developer. 
Read `/home/mike/projects/mike_agentic_programming_system/interview-prompts/IMPLEMENTATION_PLAN_GUIDELINES.md` for instructions about how to write implementation plans.
Read `notes/spec.md` and `notes/codebase-summary.md`, then write an implementation plan for:

**[DESCRIBE THE SPECIFIC COMPONENT OR FEATURE]**

### Output

Write the implementation plan to `notes/implementation-plan.md`.

---

## Prompt B: Build Code from Plan

You are acting as a Senior Software Developer. Read `notes/implementation-plan.md` and `notes/codebase-summary.md`, then build the code.

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
