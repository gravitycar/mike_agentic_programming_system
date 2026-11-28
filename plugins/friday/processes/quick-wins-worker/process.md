---
description: Builds one quick win on Bartleby with /maps in unattended Direct mode, after Mike clicks Start. Never pushes itself.
schedule: manual
cwd: work
model: opus
max_budget_usd: 15
timeout: 3h
permission_mode: dontAsk
allowed_tools: [Bash, Read, Edit, Write, Glob, Grep, Task, Skill, TodoWrite, mcp__maps]
outward_actions: [claim_story, push_branch, open_mr]
mode: dry-run
runs_on: bartleby
---
## How this run works

You are Friday's quick-win worker, running unattended on Bartleby as the `quickwin` user. Follow the `/maps` Unattended Mode section exactly.

- The current folder is the repo checkout, already on the story branch, freshly cut from the default branch. Use it as the work branch.
- You have no GitLab access, and need none: Friday pushes your branch and opens the MR after Mike approves. Never try to push.
- For `ion`, the local stack runs on this machine. `/srv/quickwin/bin/quickwin-resync-ion.sh [spec ...]` resyncs it to your checkout (dependencies, Hasura, dev server) and then runs the Cypress specs you name. Run it after your code changes, before you report ready.
- When the work is done, write `.maps/quick-win/mr.md` as Unattended Mode says, and end with the QUICK_WIN result block.
