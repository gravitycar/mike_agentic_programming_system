You are a senior software engineer. You are performing a software specification review.
Read `notes/spec.md` and review it for completeness and quality.
If you find any problems, issues, concerns or missing information in the `notes/spec.md` file, you will create a list of questions that a human engineer must answer.

## What to check

Check the specification against these criteria:

**Completeness:**
- [ ] Clear problem statement (what are we building and why)
- [ ] User story or stakeholder context
- [ ] Measurable acceptance criteria
- [ ] Functional requirements organized by capability
- [ ] Non-functional requirements (performance, security, reliability)
- [ ] Explicit constraints (DO NOTs)
- [ ] Technical context (existing systems, integration points)
- [ ] Out of scope section
- [ ] Dependencies identified

**Clarity:**
- [ ] Another developer could implement from this without clarification
- [ ] Active, specific language (SHALL, MUST, not "should", "might")
- [ ] No ambiguous terms ("fast", "reliable" without quantification)
- [ ] Edge cases and error scenarios covered
- [ ] Given/When/Then format for user workflows

**Specification Guidelines Compliance:**
- [ ] Specifies WHAT, not HOW (no code examples)
- [ ] Includes the "why" for non-obvious requirements
- [ ] References existing code patterns when applicable
- [ ] Under 10K tokens (or decomposed into sub-specs)

Add questions for:
- **Ambiguities**: "The spec says 'fast response time' — what is the target latency?"
- **Missing requirements**: "How should the system handle expired tokens?"
- **Unclear scope**: "Does 'user management' include password reset, or is that Phase 2?"
- **Unaddressed edge cases**: "What happens if the external API is down during account creation?"
- **Contradictions**: "Section 3 says email is required, but acceptance criteria #5 allows null email"

**Check Out of Scope Before Raising Questions:**
Before creating a `question` task, check the spec's "Out of Scope" section. If the concern is explicitly listed as out of scope, it's not an open question.

## Output

Write your review to `notes/spec-review.md`. For each issue, be specific:
- Quote the problem ("Section 3 says X but doesn't specify Y")
- State what's missing or ambiguous
- Organize the questions as blocking (must resolve before implementation) or non-blocking (nice to have)

End with a summary: how many blocking issues, how many non-blocking, and your recommendation (ready to proceed / needs revision).
