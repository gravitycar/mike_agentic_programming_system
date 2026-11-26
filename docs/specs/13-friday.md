# Specification: Friday (Personal Background-Agent Plugin)

## Status: Draft

## Overview
Friday is a personal Claude Code plugin that runs **independent agentic processes** on a schedule, in the background, on Mike's Mac. Each process watches for one kind of work, does what it can on its own, and surfaces to Mike only what genuinely needs him.

The first two processes:
- **Pipeline Watch** finds failed CI pipelines on Mike's open merge requests (MRs), classifies each failure, and retries or rebuilds what infrastructure broke. It reports what looks like a real code failure.
- **Review Responder** finds new review comments on Mike's open MRs. It fixes, answers, or declines each one, pushes the fixes, and replies. It escalates only the comments that would commit Mike to something.

The core is built for more processes. Adding one means adding a folder, not changing the core.

**Friday never merges an MR and never sets an MR to merge automatically.** Mike merges every MR by hand.

## Context
- **Why.** On 2026-11-18, management asked for much more output. The comparison with Andy Lin showed that Mike's MRs stay open about 20 days, against about 21 hours for Andy's. Part of that time goes to watching pipelines and answering review rounds by hand. Andy's `claude-plugin` repo automates both. Its `address-review` scheduled job is the model for Review Responder.
- **What is borrowed from Andy.** The scheduled-job format (a precheck, then one agent per item), the thread-judging questions and the three kinds of commitment, the busy-branch guard, and the "answer each thread once" state. Andy's code is not installed or copied. It assumes his machine, his paths, and a background message service.
- **What Mike already knows about CI.** Mike's `ion` project memories already describe the common `ion` failures and their remedies. Pipeline Watch's first playbook comes from them (see [Pipeline Watch](#process-1-pipeline-watch)).
- **Where it lives.** A plugin folder, `plugins/friday/`, in this repo, listed by a marketplace file at the repo root. MAPS itself is unchanged. Friday does not use the MAPS MCP server or its task database.

## Guiding Principles
1. **Mike merges.** No process merges, sets auto-merge, or pushes to a default branch. This is enforced in code and by a hook, not by prompt text alone.
2. **Free when idle.** A precheck script, with no model, decides whether there is work. A run with nothing to do costs no tokens.
3. **Escalate commitments, settle the rest.** A process acts on everything it can settle within the MR's own scope. It hands Mike only decisions that would commit him to something.
4. **Every action is bounded.** Every process has a timeout, a dollar budget per agent, retry limits, and a give-up state that stops it from repeating a failing action.
5. **Earn trust first.** Each new process starts in dry-run mode, where it records what it would do and takes no outward action, until Mike switches it on.
6. **A process is a folder.** The core knows nothing about pipelines or reviews.

## Plugin Layout

```
.claude-plugin/marketplace.json        # repo root: lists the friday plugin
plugins/friday/
├── .claude-plugin/plugin.json          # plugin manifest
├── hooks/hooks.json                    # the merge guard (PreToolUse)
├── skills/
│   ├── friday/SKILL.md              # control: list, add, pause, run, trial, status
│   ├── pipeline-watch/                 # recipe + playbooks for Process 1
│   └── review-responder/               # recipe + reply voice for Process 2
├── inbox/friday.1m.sh               # the SwiftBar plugin: a thin wrapper that calls `friday inbox --swiftbar`
├── processes/
│   ├── pipeline-watch/process.md       # schedule, limits, precheck, prompt
│   └── review-responder/process.md
└── src/                                # TypeScript core, built with the repo's tsc
    ├── cli.ts                          # the `friday` command
    ├── runner.ts                       # one run: lock → precheck → agents → record → notify
    ├── scheduler/launchd.ts            # one launch agent per scheduled process
    ├── store.ts                        # SQLite state under ~/.friday/
    ├── gitlab.ts                       # the only GitLab client; refuses merge calls
    ├── worktrees.ts                    # per-MR worktrees and the busy-branch guard
    ├── inbox.ts                        # escalations: raise, list, settle, and the SwiftBar menu
    ├── notify.ts                       # macOS notifications
    └── guard/merge-guard.ts            # the hook's logic
```

## Naming
The suite is called **Friday**. Names Mike sees use it. Names colleagues see do not, because "Friday" on an MR could be read as the weekday, such as a deadline.

| Where | Name |
|---|---|
| Plugin folder | `plugins/friday/` |
| CLI | `friday run`, `friday inbox`, `friday status`, … |
| State folder | `~/.friday/` |
| launchd agents | `com.mike.friday.<process>` |
| Menu bar | a Friday icon with the open-escalation count |
| GitLab labels (colleagues see) | `needs-mike`, `bot-gave-up` |
| Reply header (colleagues see) | "🤖 Automated reply from Friday, Mike's review assistant" |

## Core

### The process file
A process is `processes/<name>/process.md`: frontmatter, then the agent's prompt. A process that only runs a script has a `command` and no prompt.

| Key | Meaning |
|---|---|
| `description` | One sentence, shown in `friday list` and `friday status` |
| `schedule` | An interval (`10m`) or daily times (`daily 08:30`), with an optional working-hours window |
| `precheck` | A command that finds work. Exit 0 with JSON = run; exit 3 = nothing to do |
| `fan_out` | The JSON field holding a list of items. One agent runs per item, in parallel, up to `max_parallel` |
| `cwd` | Where an agent starts. `worktree` means a fresh worktree of the item's MR branch |
| `model`, `max_budget_usd`, `timeout`, `permission_mode`, `allowed_tools` | Passed to `claude -p`. Never a mode that skips permission checks |
| `outward_actions` | The outward actions this process may take, such as `retry_job` or `post_reply`. The GitLab client refuses any other action for this process |
| `mode` | `dry-run` (the default for a new process) or `live` |
| `command` | A script run in place of an agent |

### The runner
`friday run <process>` does one run:
1. Take the process's lock. If a run is still going, skip.
2. Run the precheck. Exit 3 records `skipped` and stops.
3. For each fan-out item, start `claude -p --plugin-dir plugins/friday --model … --max-budget-usd … --permission-mode … --allowed-tools … --output-format json -n friday-<process>-<item>` in the item's working directory, with the item's JSON and the process's mode in the prompt. Each agent runs in its own process group, so a timeout ends its children too.
4. Record each agent's result, cost, duration, and **session ID** from the JSON output.
5. Read the escalations the agent listed in its final message (see [Escalations and the Inbox](#escalations-and-the-inbox)) and raise each one with that session ID and working folder. A give-up or a failed run is raised the same way.

### The scheduler
`friday schedule add <process>` writes a launchd agent, `~/Library/LaunchAgents/com.mike.friday.<process>.plist`, that calls `friday run <process>`. A run happens only while the Mac is awake and Mike is logged in. `friday pause --all` is the kill switch.

### State
One SQLite file, `~/.friday/state.db` (using the `better-sqlite3` dependency the repo already has):
- **runs:** process, item, start, end, outcome, cost, and a summary.
- **handled:** what a process already did, keyed by process and subject. Examples are a pipeline job id it retried and a review thread note it answered. This is what stops repeats.
- **escalations:** items waiting on Mike. Each holds the process, the MR (project, number, URL), a one-line summary, the agent's session ID, its working folder, and when it was raised and settled.

### Escalations and the Inbox
**Dry-run escalations** appear in the inbox marked `[dry run]`, so Mike can review what a process would escalate. They add no label and post no notification.

An escalation is anything a process cannot settle on its own: a review comment that would commit Mike, a code failure in a pipeline, a limit reached, or a give-up. Escalations reach Mike through three channels:

1. **The menu bar inbox.** [SwiftBar](https://swiftbar.app), a free menu bar tool installed with `brew install --cask swiftbar`, runs `inbox/friday.1m.sh` every minute. That script calls `friday inbox --swiftbar`, which prints SwiftBar's menu format:
   - The menu bar icon shows the count of open escalations, for example `🔔 3`, and a plain icon at zero.
   - The dropdown lists each open escalation: the process, the MR, the one-line summary, and its age.
   - **Clicking an item** opens Terminal in the escalation's working folder and runs `claude --resume <session ID>`. Mike lands in that agent's full conversation, answers it there, and the agent carries on.
   - Each item has an **Open MR** sub-item, which opens the MR in the browser, and a **Dismiss** sub-item, which settles it without acting.
2. **The GitLab label.** An escalated MR gets the `needs-mike` label, so the MR itself shows it needs Mike.
3. **A macOS notification** (through `osascript`) for each new escalation.

**How an agent raises an escalation.** An agent does not need to know its own session ID. It ends its final message with an `ESCALATIONS:` block, one line per item, holding the MR and a one-line summary. The runner reads that block and raises each item with the session ID and working folder from the agent's JSON output.

**Keeping the session resumable.** Claude Code stores a session under the folder it ran in. So the runner keeps an escalated item's worktree until the escalation is settled, and removes it only then.

**Settling.** An escalation is settled, and its label removed, when any of these happens:
- Mike resumes the session from the inbox, and the agent finishes. The resumed agent runs `friday settle <id>` as its last step.
- The process's next precheck sees that Mike acted: a newer note or reaction from Mike on the thread, or a new pipeline on a new head commit.
- Mike removes the `needs-mike` label, or clicks **Dismiss**.

**The CLI is the inbox's API.** `friday inbox` lists open escalations in the terminal. `friday escalate` raises one by hand. `friday settle <id>` settles one. Later, other Claude sessions, including MAPS, can raise escalations into the same inbox. Doing that needs the session ID, which a Claude Code hook receives, so it is left for a later process.

**Status.** `friday status` shows each process's mode, its last runs, the actions taken, and the cost over the last day and week. There is no separate digest file.

### The merge guard
Three layers, so no single mistake can merge an MR:
1. **The GitLab client** has no merge function. It refuses any request to a `…/merge` endpoint, and any request that sets `merge_when_pipeline_succeeds`, `auto_merge`, or `auto_merge_strategy`.
2. **A PreToolUse hook** in the plugin denies Bash commands that merge or set auto-merge, such as `glab mr merge`, an API call to `/merge_requests/<iid>/merge`, or any of the parameters above. It also denies a push to the default branch. The hook applies in every session that loads the plugin, including Mike's interactive sessions.
3. **Every process prompt** states the rule, and no `outward_actions` value can allow it.

## Containment
The merge guard reads command text, so it cannot see what a program does once it runs. A process that may run interpreters (Review Responder runs tests and the review skill) could otherwise use Mike's GitLab sign-in and SSH key directly. So every process that runs more than `friday` runs its Bash commands in **Claude Code's sandbox**:

- Every Bash command, and every program it starts, is sandboxed. Unsandboxed retries are off, and the run fails if the sandbox is unavailable.
- Network access is limited to the process's `sandbox_domains` (package registries, the Go module proxy, and Codex for Review Responder; nothing for Pipeline Watch). `gitlab.com` and `github.com` are always denied, so SSH pushes and API calls from inside the sandbox fail.
- Only a top-level `friday` command runs outside the sandbox. Inside an agent, `friday` allows only `act`, `gl`, `escalate`, and `settle --cwd`, and it takes the mode from the state store, so an agent cannot promote itself to live.
- Tested in headless mode on 2026-11-25: sandboxed `curl` and `node` could not reach gitlab.com, the npm registry answered, SSH could not resolve gitlab.com, and a sandboxed program that started `friday` stayed sandboxed and was refused.

The merge guard hook still runs in every session, as a second layer.

## Process 1: Pipeline Watch

**Schedule:** every 10 minutes, weekdays 07:00–18:00 local time. **Model:** `sonnet`. **Outward actions:** `retry_job`, `play_job`, `rebuild_review_env`, `add_label`, `remove_label`. It posts no notes or comments on MRs.

**Precheck (no model).** It lists Mike's open MRs in the configured projects. For each one it reads the latest pipeline on the head commit. It selects pipelines that have a failed job that is not allowed to fail, and whose newest instance has not been handled yet. Retried jobs create new instances, so the precheck always takes the newest instance per job name.

**Deterministic tier (no model).** GitLab reports a `failure_reason` per job. A job that failed with `runner_system_failure`, `stuck_or_timeout_failure`, `scheduler_failure`, `api_failure`, or `runner_unsupported` is retried once by the precheck itself, at no token cost.

**Agent tier.** One agent per remaining MR. It reads the failed jobs' log tails and, for Cypress, the screenshot artifacts. It classifies each failure with the repo's playbook, `skills/pipeline-watch/playbooks/<repo>.md`:

| Class | Example (ion) | Action |
|---|---|---|
| Infra, retryable | Deploy job `BackoffLimitExceeded` from `hasura-pool-settings`; a network or Docker error | Retry the job |
| Review env broken | Cypress `ECONNREFUSED 127.0.0.1:5432`; `relation "hdb_catalog.schema_migrations" does not exist` | Rebuild the review env: play `delete-review-env-manual`, then `deploy-review-env-manual`, retry the auto `deploy-review-env`, check that the env answers (its UI URL returns 200), then retry the Cypress jobs. Never play the delete without the deploy |
| Code | Lint, type check, `semver-test` title check, a unit test that fails on the MR's own change | Report to Mike with the evidence. Take no action |
| Unknown | Anything the playbook does not cover | Report to Mike |

The `ion` playbook starts from Mike's `ion` memories `ci-review-env-cypress-ops`, `review-env-infra-faults`, and `cypress-ci-failure-triage`. A new repo gets its own playbook file.

**Limits.** At most 2 retries per job name per pipeline, and at most 1 review-env rebuild per MR per day. Past either limit, the MR is escalated with the evidence, not retried again.

## Process 2: Review Responder

**Schedule:** every 30 minutes, weekdays 07:00–18:00 local time. **Model:** `opus`, because judging review comments is the hard part. **Outward actions:** `push_branch`, `post_reply`, `add_reaction`, `add_label`, `remove_label`.

**Precheck (no model).** It lists Mike's open, non-draft MRs with unresolved threads, or general comments, whose last note is by someone other than Mike or Friday, and that are not yet handled. It skips an MR whose branch is busy: a live Claude session in a checkout of it, unsaved changes in a checkout, or another Friday run. It also skips threads already escalated, until Mike responds.

**Agent per MR**, in a Friday-owned worktree of the MR's branch, following `skills/review-responder/SKILL.md`. It judges each thread with these questions, in order:
1. **Is it a finding?** A question → answer it. Thanks or an FYI → a 🤖 reaction and nothing else.
2. **Does it hold against the code?** No → decline it, saying what the code does.
3. **Would acting on it commit Mike?** Yes, for **scope** (the fix goes well past the MR), **position** (it takes a side someone else owns, or settles a dispute between reviewers), or **irreversible** (data, migrations, production impact) → escalate.
4. **Otherwise, fix it**, with the reviewer's suggestion or a better fix, saying why when it differs.

Then:
- **Check.** Run the tests for the touched area. Then run `code-reviewer-metarouter` on the branch, for at most 3 rounds, as in the MAPS review loop.
- **Push.** Commit the fixes as a new commit on top of the branch and push it. Never amend, and never force-push.
- **Reply.** Post one short reply per thread, each with the header "🤖 Automated reply from Friday, Mike's review assistant". It never resolves a thread: resolving is not one of its outward actions, so the GitLab client refuses it. An escalation reply says "flagged for a decision" in neutral words and labels the MR `needs-mike`.
- **Your reactions steer it.** 👍 on an escalation or a suggestion means do it. 👀 means hold off.

**Give-up.** If review does not reach LGTM in 3 rounds, or a push is rejected twice, the MR is labelled `bot-gave-up` and left alone until Mike removes the label.

## Adding a Process
1. Create `processes/<name>/process.md`, with a precheck script if it watches for work.
2. If its agent follows a recipe, add `skills/<name>/SKILL.md` and its references.
3. Declare its `outward_actions`. If it needs a new kind of GitLab action, add that action to `gitlab.ts`. The merge guard still applies.
4. Run it with `friday trial <name>`. This is a single dry run that records nothing, so you can watch what it would do.
5. `friday schedule add <name>`. It starts in dry-run mode. Switch it on with `friday mode <name> live`.

## Build Phases
All three phases are built (2026-11-25). Pipeline Watch and Review Responder start in dry-run mode.

1. **Core:** the plugin and marketplace files, the CLI, the runner, launchd, the state store, the GitLab client, the merge guard hook, the escalation inbox (SwiftBar menu, label, notification, resume, settle), `friday status`, and a `hello` process that raises a test escalation to prove it end to end.
2. **Pipeline Watch,** first in dry-run mode, then live.
3. **Review Responder,** first in dry-run mode, then live.

## Requirements
- The plugin lives in `plugins/friday/` in this repo, listed by `.claude-plugin/marketplace.json` at the repo root.
- No process merges an MR, sets auto-merge, or pushes to a default branch, enforced by the GitLab client and by a PreToolUse hook.
- A run with no work costs no tokens. Every agent has a timeout and a dollar budget.
- Every process declares its outward actions, and the GitLab client refuses anything else.
- Every escalation appears in the SwiftBar menu bar inbox, carries the `needs-mike` label on its MR, and raises a macOS notification. Clicking it resumes the agent's session in its working folder. An escalated item's worktree is kept until the escalation is settled.
- A new process starts in dry-run mode.
- Pipeline Watch retries only infrastructure failures, within its limits, and reports code failures.
- Review Responder escalates only scope, position, and irreversible commitments. It never answers the same thread twice, and never works on a busy branch.
- Adding a process needs no change to the core.

## Dependencies
- `glab`, already signed in to MetaRouter's GitLab.
- The `code-reviewer-metarouter` skill (MetaRouter plugin 0.22.0 or later).
- Node and TypeScript as pinned by this repo, and `better-sqlite3`.
- macOS launchd and `osascript`.
- SwiftBar (`brew install --cask swiftbar`) for the menu bar inbox.

## Open Questions
1. ~~Should the core be written in TypeScript or in Python?~~ **Resolved** — TypeScript, like the rest of this repo: one toolchain and one build.
2. ~~How should Review Responder push its fixes?~~ **Resolved** — as new commits, one per fix round, never amended and never force-pushed. MRs are squash-merged, so `master` stays clean, and reviewers see each fix separately.
3. ~~May Pipeline Watch rebuild an MR's review env on its own?~~ **Resolved** — yes, for `ion`, at most once per MR per day. It always plays the delete and the deploy together, retries the auto `deploy-review-env`, and checks that the env answers before it retries Cypress. Every rebuild appears in `friday status`.
4. ~~Should Pipeline Watch only report a code failure, or try to fix it?~~ **Resolved** — report only: label the MR `needs-mike` and notify, with the failing job, the error, and the likely cause. It never changes code. A later process may take on fixes.
5. ~~Where should escalations reach Mike?~~ **Resolved** — a SwiftBar menu bar inbox that lists open escalations and resumes the agent's session on a click, plus the `needs-mike` label and a macOS notification. No daily digest: `friday status` covers costs and actions. A full Mac app like Andy's Knockbox is not needed. Raising escalations from interactive sessions, such as MAPS, is left for later.
6. ~~How long should each new process stay in dry-run mode?~~ **Resolved** — no fixed length. A process stays in dry-run until Mike switches it on by hand with `friday mode <name> live`, after reading its recorded decisions in `friday status`. Nothing switches a process to live automatically.
7. ~~Which projects should the processes watch, and during which hours?~~ **Resolved** — `metarouter/ion` (clone at `~/metarouter/ion`) and `metarouter/roost` (clone at `~/metarouter/roost`), on weekdays from 07:00 to 18:00 local time. Pipeline Watch starts with an `ion` playbook; a `roost` failure it cannot classify goes to the inbox as unknown, and a `roost` playbook grows from real failures.
8. ~~Should Review Responder resolve the threads it fixes, or leave resolving to the reviewer?~~ **Resolved** — leave it to the reviewer. Review Responder never resolves or unresolves a thread. The reviewer decides when a concern is settled, and Mike resolves any leftovers himself at merge time.
9. ~~What should the suite be called?~~ **Resolved** — "Friday", after Tony Stark's AI assistant. Everything that is Mike's own uses the name: the plugin folder, the `friday` CLI, `~/.friday/`, the launchd agents, and the menu bar icon. What colleagues see uses plain wording that cannot be read as the weekday: the labels `needs-mike` and `bot-gave-up`, and a reply header that names Friday in a full sentence. See [Naming](#naming).

## Version History
| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1.0 | 2026-11-25 | Mike Andersen | Initial draft: core runner, scheduler, state, merge guard, Pipeline Watch, Review Responder, and the process-folder extension model. |
| 0.1.1 | 2026-11-25 | Mike Andersen | Resolved open questions #1 to #6: TypeScript; new commits, never amended or force-pushed; automatic review-env rebuilds for `ion`; report-only code failures; a SwiftBar menu bar inbox with one-click session resume in place of the daily digest; dry-run until Mike switches a process live by hand. |
| 0.1.2 | 2026-11-25 | Mike Andersen | Renamed the suite from Autopilot to Friday, with neutral colleague-facing labels (`needs-mike`, `bot-gave-up`) and reply header. Resolved open questions #7 to #9: `ion` and `roost` on weekdays 07:00 to 18:00; reviewers resolve their own threads; the name. All open questions resolved. |
| 0.1.3 | 2026-11-25 | Mike Andersen | Built. Changes found while building: Pipeline Watch posts no notes and declares `rebuild_review_env` and the label actions; every process that escalates on an MR declares `add_label` and `remove_label`, so settling removes the label; Review Responder runs on `opus` and keeps one worktree per open MR (pruned when the MR closes), so dependencies install once; dry-run escalations show in the inbox without a label or notification; `friday run --only <label>` runs one item; a `hello` process tests the inbox end to end. |
| 0.1.4 | 2026-11-25 | Mike Andersen | Added Containment: Review Responder and Pipeline Watch run their Bash commands in Claude Code's sandbox, with GitLab reachable only through `friday`. Chosen by Mike over a tools-only restriction after a code review showed text guards cannot stop an interpreter. Also fixed 17 defects from that review. |
