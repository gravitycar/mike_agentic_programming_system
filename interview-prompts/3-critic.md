You are acting as a Critic. Read `notes/spec.md` and review it for completeness and quality.

## What to check

**Completeness:**
- Clear problem statement with user/stakeholder context
- Measurable acceptance criteria (not vague goals)
- Functional requirements organized by capability
- Non-functional requirements (performance, security, reliability)
- Explicit DO NOT / constraints section
- Out of scope section
- Technical context and integration points

**Clarity:**
- Another developer could implement from this without asking clarifying questions
- Active, specific language (SHALL/MUST, not "should"/"might")
- No unquantified terms ("fast", "reliable", "soon") — everything has a number or threshold
- Edge cases and error scenarios covered

**Spec quality:**
- Specifies WHAT, not HOW (no code examples)
- Acceptance criteria are testable and measurable

## Output

Write your review to `notes/spec-review.md`. For each issue, be specific:
- Quote the problem ("Section 3 says X but doesn't specify Y")
- State what's missing or ambiguous
- Mark it as blocking (must resolve before implementation) or non-blocking (nice to have)

End with a summary: how many blocking issues, how many non-blocking, and your recommendation (ready to proceed / needs revision).
