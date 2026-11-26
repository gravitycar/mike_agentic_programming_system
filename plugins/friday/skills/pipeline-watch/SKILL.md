---
name: pipeline-watch
description: The recipe Friday's Pipeline Watch agent follows for one MR with a failed pipeline - read the failed jobs, classify each with the repo's CI playbook, retry or rebuild what infrastructure broke, and escalate code failures. Not for interactive use.
---

# Pipeline Watch

You handle **one** merge request whose latest pipeline failed. The item in your prompt lists its failed jobs. Jobs that GitLab itself marked as runner or timeout faults were already retried before you started; you see what is left.

You never change code, never post notes or comments, and never merge. Your outward actions are retries, playing manual jobs, and the review-env rebuild, all through `friday act`.

## 1. Read the playbook

The playbook for this repo is `playbooks/<repo>.md` in the same folder as this SKILL.md, where `<repo>` is the last part of the item's `project` (for example `ion`). Read it first. If there is no playbook for the repo, use the general rules in step 3 only.

## 2. Read each failed job

For each job in `failed_jobs`:

```bash
friday gl log --job <id> --tail 300
```

Read the end of the log first: the failing command and its message decide the class. For a Cypress job whose log does not make the cause clear, look at its failure screenshots:

```bash
mkdir -p ./mr-<mr>
friday gl artifacts --job <id> --out ./mr-<mr>/artifacts.zip
unzip -o -q ./mr-<mr>/artifacts.zip 'cypress/screenshots/*' -d ./mr-<mr>
```

Then Read the `.png` files. A screenshot that shows the element Cypress could not find means it arrived too late (slow load), not that the code broke.

## 3. Classify each job

Use the playbook's table. Without a matching playbook entry:

| Class | Signs | Action |
|---|---|---|
| **Infra, retryable** | Network or DNS errors, `connection reset`, registry or image pull failures, Docker errors, `BackoffLimitExceeded` in a deploy job, an out-of-memory kill of a runner, a timeout with no test output | Retry the job |
| **Review env broken** | Only where the playbook defines it | Rebuild the review env |
| **Code** | Lint or type errors, a compile error, a unit test whose assertion fails, a title-format check | Escalate with the evidence |
| **Unknown** | Anything else | Escalate with the evidence |

When unsure between infra and code, choose **Unknown**: a wrong retry wastes a pipeline, a wrong escalation costs Mike a glance.

## 4. Act

- **Retry:** `friday act retry-job --job <id> --why "<one-line reason>"`. A job already retried twice in this pipeline (`retries_used` is 2) is not retried again: escalate it instead. `friday act` refuses a third retry anyway.
- **Rebuild the review env** (only where the playbook says so): run `friday act rebuild-review-env` and read its JSON `status`:
  - `in_progress`: run it again. Repeat until another status comes back.
  - `done`: the env is rebuilt and the Cypress jobs were retried.
  - `dry-run`: the process is in dry-run mode; the rebuild was recorded, not run.
  - `refused` or `failed`: escalate with its `message`.
  Never play the delete or deploy jobs yourself: the rebuild command runs them together, in order, and checks the env.
- **Escalate:** add a line to your ESCALATIONS block. Use the subject `pipeline:<pipeline id>:job:<job name>`, one line per failing job, so each job gets its own inbox item. Name the job, the error in a few words, and the likely cause, for example: `metarouter/ion!4321 | pipeline:998877:job:test-unit | test-unit: 2 failing assertions in audit-log.test.ts after the rename - likely a real regression`.

## 5. Report

End with two or three lines on what you found and did, then the ESCALATIONS block (or `- none`).
