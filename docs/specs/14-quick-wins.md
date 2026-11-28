# Specification: Quick Wins (Friday Scout and Worker)

## Status: Built (2026-11-28). The scout is scheduled in dry-run. The worker has not built a story yet.

## Overview
Quick Wins adds two Friday processes ([13-friday.md](13-friday.md)) that find small Shortcut stories and build them, one at a time:

- **Scout** (scheduled). Looks through Shortcut for one story that is a quick win and offers it to Mike in the Friday inbox. It offers nothing while another quick win is pending or in process.
- **Worker** (started by Mike's click). Claims the story and builds it on **Bartleby**, a dedicated development machine, with `/maps` in an unattended Direct mode ([11-intake.md](11-intake.md)). It runs unit tests and the affected Cypress specs there, pushes the branch, and asks Mike before an MR is opened.

A **quick win** is a story with no external dependencies, that fits in one MR, and has a simple problem with a self-evident solution: exactly the stories the Intake scope probe would route to the Direct path.

## Context
- **Why.** Small, necessary stories (chores, version bumps, security patches, flaky tests) sit in Shortcut because nobody has time for them. Each takes little thought but real time. Quick Wins turns that time into Mike's output without adding to his choices: he sees one candidate at a time.
- **Prior art.** Andy Lin's `bank/lane` job starts one builder at a time on the oldest eligible entry of his own fixit backlog, skips entries that need his sign-off (UI), records each start on the entry itself, and reconciles merged and abandoned work on every run. Quick Wins borrows those four ideas. It differs in where work comes from (Shortcut, not a private backlog) and in who approves a start (Mike, one click per story).
- **Supply.** The KTLO epic alone holds few candidates (on 2026-11-28, about 6 of 118 stories were open and unstarted, most owned by SRE). So the scout reads every epic, filtered by the eligibility rules below.

## Guiding Principles
1. **One at a time.** At most one candidate is offered, and at most one quick win is in process. Mike is never shown a list.
2. **Mike approves every visible step.** The scout only offers. The worker starts, claims a story, and opens an MR only on Mike's click.
3. **No duplicate work.** A candidate that someone is already working on, or that was recently done, is never offered.
4. **Prove it before pushing.** The worker runs unit tests and the affected Cypress specs on a stack nobody else is using.
5. **Remember every no.** A dismissed or disqualified story is not offered again.

## Eligibility
A story is a **candidate** when all of these hold:
- Its workflow state is **Ready for Work** (state id `500000028`, Product Development workflow), in **any epic**.
- It has **no owner and its team is Platform**, or **its owner is Mike**.
- It belongs to `metarouter/ion` or `metarouter/roost`, the repos Friday is set up for. A story for any other repo is skipped, with the reason recorded.
- Mike has not dismissed it, and the scout has not ruled it out.

## The Scout

**Schedule:** hourly, weekdays 07:00 to 18:00. **Model:** `sonnet`. **Budget:** $1 per run that reaches the scope probe. **Outward actions:** none. It only reads Shortcut and GitLab and writes to the inbox.

**Precheck (no model).** The run ends at no cost when:
- a candidate is already waiting in the inbox, or
- a quick win is in process (see [States](#states)).

The precheck also **reconciles** first, as Andy's lane does. It checks the quick win in process: whether its MR was opened, and whether its worker is still running or ended. It updates the state accordingly.

**Picking a candidate.** Otherwise the precheck lists eligible stories in this order: stories in the current iteration first, then by Shortcut priority, then oldest first. The agent takes them one at a time:

1. **Duplicate search (cheap).** Search Shortcut and GitLab for stories and MRs that describe the same work. Disqualify the candidate if a duplicate is:
   - started: In Progress, In Review, or Ready for Acceptance Testing;
   - Done or Deployed within the last 90 days; or
   - addressed by an open MR.

   When unsure whether two stories are duplicates, treat them as duplicates and skip.
2. **Scope probe.** Run the Intake scope probe against the story's repo. Disqualify the candidate unless the probe recommends **Direct**.
3. **Offer.** The first candidate that passes both is offered (see [The inbox item](#the-inbox-item)). The run ends.

A disqualified story is **ruled out**, with its reason recorded (for example `duplicate of sc-46123, in progress` or `probe: Full, schema migration`). `friday status quick-wins` lists ruled-out stories and reasons. A story ruled out as a duplicate becomes eligible again if that duplicate goes back to Ready for Work.

### The inbox item
One item per candidate:
- **Title:** the story number and name.
- **Body:** the probe's one-sentence reason, the repo, and any **open duplicates nobody is working on** ("Possible duplicates: sc-45210, sc-46877"), so Mike can close them after the quick win ships. Friday never closes other people's stories.
- **Start:** starts the worker on this story.
- **Dismiss:** Mike does not want this story. The scout never offers it again.
- **Open story:** opens the story in Shortcut.

## The Worker

**Started by:** Mike's **Start** click. **Runs on:** Bartleby. **Model:** `opus`. **Budget:** $15 per quick win. **Outward actions:** `claim_story`, `push_branch`, `open_mr` (each only after Mike's click, as below).

1. **Claim.** Set Mike as the story's owner and move it to **In Progress**. This happens on Mike's click, never on the scout's judgment.
2. **Prepare Bartleby.** Bring the repo's default branch up to date, create the story branch (`<user>/<type>/sc-<story#>/<slug>`, as in `mr-maps`), and for `ion` resync the stack (see [Bartleby](#bartleby)).
3. **Build.** Run `/maps` in **unattended Direct mode** with the story as the problem statement: the Direct path with item commits, the code review loop, and the question ladder ([12-review-loop.md](12-review-loop.md)). Then run the affected Cypress specs against Bartleby's stack, using the `mr-maps` affected-spec rule.
4. **Push.** Push the branch. Never force, never to a default branch.
5. **Ask.** Raise one inbox item: **"sc-N is ready. Open MR?"**, with **Open MR**, **Resume** (to inspect the work first), and **Dismiss**.
6. **Open MR**, on Mike's click: Friday opens the MR with the repo's template and Mike's description format (Overlay 9 of `mr-maps`), assigned to Mike. Friday never merges and never sets auto-merge. Pipeline Watch and Review Responder take it from there.

**When a quick win turns out not to be quick.** If the Direct path would escalate to Full (a design choice, a risk signal, or a check it cannot pass in two tries), the worker stops and saves its work on a `-direct` branch. **The story stays assigned to Mike.** One inbox item says why, with **Resume** (Mike may answer the blocking question there and let the work continue) and **Dismiss**.

### Unattended `/maps`
The worker needs `/maps` to run with no person present. An unattended mode changes three steps:
- **Intake** proceeds only on a **Direct** recommendation; any other outcome ends the run with an inbox item.
- **Questions** go up the question ladder as usual; what reaches level 3 (the user) becomes an inbox item, answered by resuming the session.
- **The Direct path's user review** becomes the "Open MR?" item.

## States
A quick win moves through these states, stored in Friday's state file:

| State | Meaning | The scout may offer a new candidate? |
|---|---|---|
| `offered` | In the inbox, waiting for Start or Dismiss | No |
| `building` | The worker is running on Bartleby | No |
| `awaiting-mr` | Pushed; the "Open MR?" item waits for Mike | No |
| `stuck` | Not quick after all; waiting for Mike to resume or dismiss | No |
| `mr-opened` | Done, from the scout's point of view | Yes |
| `dismissed` / `ruled-out` | Never offered again (ruled-out may reopen, as above) | Yes |

## Bartleby
Bartleby is Mike's spare Ubuntu machine (`bartleby.local`, 192.168.1.31; 4 cores, 16 GB) with `ion`, `roost`, the `kind` cluster, and Claude Code installed, used by no one else. Using it:
- solves the Cypress problem: it has a full stack that no other work shares;
- enforces one-at-a-time physically, with one stack;
- keeps Mike's own Mac, checkouts and `kind` cluster untouched.

**How Friday uses it.** Friday stays on the Mac: the scheduler, state, inbox, and scout. The worker runs on Bartleby as a separate Linux user, **`quickwin`**, which has **no GitLab credentials** (no SSH key, no `glab` login, a placeholder `NPM_READ_TOKEN`) and no `docker` or `sudo` access. That operating-system boundary replaces Claude Code's sandbox on Bartleby: Cypress needs a display and a direct Postgres connection, which the Linux sandbox blocks (tested 2026-11-28).

- **Repos.** Mike's user keeps bare mirrors of `ion` and `roost` in `/srv/quickwin/mirrors`, fetched from GitLab with Mike's key. `quickwin` works in its own clones in `/srv/quickwin/work`, whose only remote is the local mirror.
- **Starting the worker.** Friday runs, over SSH as Mike, `sudo -u quickwin` (allowed for Mike's user, never as root) to start `claude -p` in `quickwin`'s clone. `quickwin` uses its own copy of Mike's long-lived Claude token.
- **Pushing.** When the worker reports it is done, Friday, as Mike, fetches the branch from `quickwin`'s clone into the mirror and pushes it to GitLab by URL. No repo code runs in that step, and the usual rules hold: never force, never a default branch.
- **Resume** opens Terminal with `ssh -t bartleby.local`, then `sudo -u quickwin` into the session's folder, and runs `claude --resume <session>`.
- **Setup scripts** live in `plugins/friday/bartleby/`: `setup-quickwin-user.sh` (root, run once by Mike), `setup-quickwin-tools.sh` (as `quickwin`), `setup-quickwin-repos.sh` (as Mike), and `quickwin-resync-ion.sh` (as `quickwin`, the resync plus optional Cypress specs). Run them as files, not through standard input, because tools inside read standard input. Node 22.23.4 and Go 1.26.10 are copied into `/srv/quickwin/toolchains` from Mike's installs (`asdf install` fails silently for `quickwin`).
- **Mike's old dev server** on Bartleby is replaced by `quickwin`'s; the worker owns port 3000.

**Resyncing the `ion` stack to a branch** (from Mike's `ion` notes, extended by the readiness checks): `yarn install`; then `git checkout -- .yarn/cache` (Yarn on Linux prunes macOS-only packages from the committed cache, which would otherwise show as deletions); then, in `packages/hasura`, `hasura migrate apply`, `hasura metadata reload`, and `make setup` (Hasura caches enum-table values, so a migration that adds one fails the metadata apply until a reload); then restart the `packages/app` dev server (`yarn app`, detached), wait for port 3000, and check `curl -s localhost:3000/main.js | grep -c webpackMissingModule` is 0. The app and Cypress must use the same Hasura URL (`HASURA_URL` in `packages/app/.env` and in the repo-root `.env`), or Cypress intercepts never match. Migrate status and metadata consistency are not proof of sync; re-apply metadata before trusting a Cypress result.

**When Bartleby is unreachable** (Mike away from home, or the machine off), the worker does not start: the Start click raises an item saying Bartleby is offline, and the candidate stays offered.

### Readiness checklist
Checked on 2026-11-28 before building:

| Check | Result |
|---|---|
| Reachable over SSH without a password; `bartleby.local` resolves | Pass |
| Claude Code installed (2.1.322) | Pass |
| Claude Code signed in for unattended use | **Pass** after Mike created a long-lived token (`claude setup-token`) in `~/.claude-oauth-token`; `quickwin` has its own copy |
| Sandbox prerequisites | Pass: `bubblewrap` present; `socat` installed by Mike on 2026-11-28 |
| `ion` stack running in `kind-local-dev` | Pass (ion-api shows 31 restarts, so it is not perfectly stable) |
| Cypress credentials | Pass: same dev-tenant user (`cypress@metarouter.io`) and password as Mike's Mac; it cannot lock the CI review tenant's lane users |
| Stack resync and one Cypress spec green on current `master` | **Pass** after four fixes: `yarn` enabled for node 22.23.4 through corepack; Bartleby's MAPS-install edits to `.gitignore` moved to `.git/info/exclude`; a Hasura metadata reload before `make setup`; and `packages/app/.env` switched from port 18080 (Mike's old tunnel setup, kept as `.env.bak-tunnel`) back to 8080 to match Cypress. Then `settings-consent-categories.cy.js` passed 5 of 5 in 45 s |
| Sandbox on Linux | Works after an AppArmor profile for `bubblewrap` (`/etc/apparmor.d/bwrap`): GitLab blocked every way, local stack reachable through the proxy. **But Cypress cannot run inside it** (Xvfb fails; Postgres is not HTTP). Replaced by the `quickwin` user |
| `quickwin` user: no GitLab access, full stack, Cypress green | **Pass**: SSH to GitLab denied, no `glab`, no key; resync and `settings-consent-categories.cy.js` 5 of 5 as `quickwin` |

## Model Routing
| Step | Model | Why |
|---|---|---|
| Scout (duplicate search, scope probe) | `sonnet` | Finding and comparing stories; the probe is the same as Intake's |
| Worker (`/maps` unattended Direct) | `opus` | Builds and judges code changes, like Review Responder |

## Build
The code is in `plugins/friday/`. These parts make up Quick Wins:

- **Processes.** `processes/quick-wins-scout/` runs hourly in working hours. `processes/quick-wins-worker/` has a manual schedule and `runs_on: bartleby`.
- **Scout skill.** `skills/quick-wins-scout/SKILL.md` holds the repo check, the duplicate search, the scope probe, and the record step.
- **Code.** `src/shortcut.ts` is the Shortcut client. `src/qw.ts` holds eligibility, reconcile, offer, start, the worker run, and Open MR.
- **Commands.** `friday sc search|story` reads Shortcut. `friday qw offer|rule-out|start|open-mr|run-worker|status` drives the states. Inside an agent, only the scout may call `qw offer`, `qw rule-out`, and `sc`.
- **Config.** Mike's Shortcut member id and mention name live only in `~/.friday/config.json`. The Shortcut token lives in `~/.friday/shortcut-token` (mode 600).
- **Bartleby.** `bartleby/` holds the setup scripts, `quickwin-resync-ion.sh`, and `quickwin-claude.sh`, which starts Claude with the MAPS MCP server. `setup-quickwin-maps.sh` installs MAPS into the quickwin clones and never changes tracked files.
- **`/maps`.** The Unattended Mode section in `.claude/commands/maps.md` handles the `UNATTENDED:` prompt and ends with the `QUICK_WIN_RESULT` block.

## Requirements
- Two processes, `quick-wins-scout` (scheduled) and `quick-wins-worker` (started from the inbox), each starting in dry-run mode. In dry-run, the scout still offers real candidates, marked `[dry run]`; the worker builds on Bartleby but does not claim the story or push.
- The scout offers at most one candidate, and none while a quick win is offered, building, awaiting an MR, or stuck.
- Eligibility, ordering, the duplicate search, and the probe work as described above. Dismissed stories are never offered again.
- The worker claims the story, builds and tests on Bartleby, pushes, and opens an MR only on Mike's click. It never merges.
- New Friday outward actions: `claim_story` (a Shortcut write) and `open_mr`. Both are refused to every other process.
- `/maps` gains an unattended mode, as described above.
- Inbox items gain actions beyond Resume and Dismiss: Start, Open MR, and Open story.

## Dependencies
- [13-friday.md](13-friday.md): the runner, inbox, sandbox, and merge guard.
- [11-intake.md](11-intake.md) and [12-review-loop.md](12-review-loop.md): the scope probe, the Direct path, and the question ladder.
- [10-mr-maps.md](10-mr-maps.md): branch names, the affected-Cypress-spec rule, and the MR description format.
- Shortcut read access for the scout and Shortcut write access for `claim_story`.
- Bartleby, prepared as in the readiness checklist.

## Open Questions
1. ~~When does a quick win stop being in process?~~ **Resolved:** when its MR is opened.
2. ~~Who opens the MR?~~ **Resolved:** the worker pushes, then asks; Friday opens the MR on Mike's click.
3. ~~Should Friday claim the story?~~ **Resolved:** yes, on Mike's Start click.
4. ~~How are duplicates handled?~~ **Resolved:** the duplicate search above, skipping when unsure.
5. ~~Schedule, order, repos, budget, dry-run?~~ **Resolved:** as above.
6. ~~What if a quick win is not quick?~~ **Resolved:** stop, keep the story assigned to Mike, one item with Resume and Dismiss.
7. ~~How can Cypress run unattended?~~ **Resolved:** on Bartleby, which also removes the need to skip UI stories.

## Version History
| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1.0 | 2026-11-28 | Mike Andersen | Initial draft from the design discussion: scout and worker, eligibility, one-at-a-time states, duplicate search, claim on Start, push then ask, Bartleby as the worker host, and the readiness checklist. |
| 0.1.1 | 2026-11-28 | Mike Andersen | Bartleby readiness completed. The worker runs as a separate `quickwin` user with no GitLab credentials (Mike's choice over loosening the sandbox for Cypress); Friday pushes from a mirror with Mike's access. Added the setup scripts and the extended resync recipe. |
| 0.1.2 | 2026-11-28 | Mike Andersen | Built. Added the Build section. The scout trial ruled out three stories with correct reasons, and the scout is scheduled in dry-run. |
