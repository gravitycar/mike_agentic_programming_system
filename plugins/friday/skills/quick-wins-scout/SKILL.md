---
name: quick-wins-scout
description: The recipe Friday's Quick Wins scout follows - check up to three candidate Shortcut stories for duplicates and for Direct-path size, then offer the first that passes. Not for interactive use.
---

# Quick Wins scout

Your item lists up to three **candidates**, best first, and `clones`: read-only checkouts of each repo's default branch on this Mac. Offer at most **one** story. Mike sees only what you offer.

Take the candidates **in order**. For each one, run the three checks below. The first candidate that passes all three is offered; then stop, and leave the later candidates untouched. A candidate that fails a check is ruled out, with a one-line reason, and is never offered again.

## 1. Which repo?

Decide from the story text and, where needed, the code whether the work belongs in `ion` or `roost`. If it belongs in neither, or in more than one, rule it out: `repo: other` or `repo: spans ion and roost`.

## 2. Is it a duplicate?

Search Shortcut and GitLab for the same work, using two to four distinctive words from the story:

```bash
friday sc search <words>
friday gl get "projects/metarouter%2F<repo>/merge_requests?state=opened&search=<words>"
```

Shortcut state ids: In Progress `500000006`, Ready for Code Review `500000029`, Ready for Acceptance Testing `500000030`, Done `500000011`, Deployed `500000681`.

Rule the candidate out when another story describing the same work is **started** (the three started states), or **Done or Deployed in the last 90 days**, or an **open MR** addresses it. When you are unsure whether two stories describe the same work, treat them as duplicates: rule it out and name the other story.

Collect any **open duplicates nobody is working on** (Ready for Work or earlier, no owner) for the offer.

## 3. Is it a Direct-path quick win?

This is the Intake scope probe. Read the code in `clones[<repo>]` with Read, Grep and Glob. The candidate passes only when the change is **mechanical, with one obvious approach, provable by the repo's existing checks**, and none of these risk signals applies:

- more than one reasonable approach;
- new behavior that needs new tests (updating expected values in existing tests is fine);
- a schema or data migration;
- a change to an API contract other code or teams use;
- authentication, secrets, or credentials;
- LLM integration;
- a breaking change in a dependency's changelog;
- it needs information the story does not give and the code cannot answer.

File count is not a signal. A UI change is allowed: the worker runs Cypress on Bartleby.

## 4. Record the decision

Offer the first that passes, with one sentence on why it is a quick win:

```bash
friday qw offer --story <id> --name "<story name>" --repo <ion|roost> --reason "<one sentence>" --duplicates "sc-<n>, sc-<n>"
```

Leave out `--duplicates` when there are none. Rule out each candidate that failed:

```bash
friday qw rule-out --story <id> --name "<story name>" --reason "<check>: <one line>"
```

End with one line per candidate you decided on, then:

```
ESCALATIONS:
- none
```
