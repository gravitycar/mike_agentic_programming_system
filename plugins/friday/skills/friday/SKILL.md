---
name: friday
description: Control Friday, Mike's scheduled background agents (Pipeline Watch, Review Responder). Use when Mike asks what Friday is doing, wants to see or settle escalations, switch a process between dry-run and live, schedule or pause a process, or add a new process.
---

# Friday

Friday runs independent agentic processes on a schedule. Each process lives in `plugins/friday/processes/<name>/process.md` in the MAPS repo (`~/projects/mike_agentic_programming_system`). The `friday` command controls everything; `friday setup` links it into `~/.local/bin`. Friday **never merges an MR and never sets auto-merge**; Mike merges by hand.

## Common commands

| Mike wants to | Command |
|---|---|
| See what Friday is doing, its costs, and what a dry-run process would have done | `friday status` (or `friday status <process>`) |
| See open escalations | `friday inbox` |
| Answer an escalation | `friday resume <id>` (opens Terminal in the agent's session) |
| Dismiss an escalation | `friday settle <id> --reason "<why>"` |
| Switch a process on after reviewing its dry run | `friday mode <process> live` |
| Switch it back to dry run | `friday mode <process> dry-run` |
| Schedule, pause, or resume a process | `friday schedule add|pause|resume|remove <process>` |
| Stop everything at once | `friday pause --all` (and `friday resume --all`) |
| Try a process once without touching real state | `friday run <process> --trial` |
| Run a process now, outside working hours | `friday run <process> --force` |

## Adding a process

1. Create `processes/<name>/process.md`: frontmatter (description, schedule, precheck, fan_out, cwd, model, max_budget_usd, timeout, permission_mode, allowed_tools, outward_actions, mode), then the agent's prompt. `{plugin_dir}` in the prompt becomes the plugin folder.
2. Write a precheck that prints `{"items": [...]}` and exits 0 when there is work, or exits 3 when there is none. A built-in precheck is `friday precheck <name>`; any command works.
3. If the agent follows a recipe, add `skills/<name>/SKILL.md`.
4. Declare only the outward actions it needs. Add a new kind of action to `src/gitlab.ts` (`Actor`) and `friday act`; the merge guard still applies.
5. `friday run <name> --trial`, then `friday schedule add <name>`. It starts in dry-run mode until Mike runs `friday mode <name> live`.

The spec is `docs/specs/13-friday.md` in the MAPS repo.
