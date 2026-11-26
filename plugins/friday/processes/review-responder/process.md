---
description: Fixes, answers, or declines new review comments on my MRs, pushes new commits, and escalates only commitments.
schedule: 30m
precheck: friday precheck review-responder
fan_out: items
max_parallel: 2
cwd: worktree
model: opus
max_budget_usd: 8
timeout: 60m
permission_mode: dontAsk
allowed_tools: [Read, Edit, Write, Grep, Glob, Skill, "Bash(friday:*)", "Bash(git:*)", "Bash(cat:*)", "Bash(head:*)", "Bash(tail:*)", "Bash(grep:*)", "Bash(wc:*)", "Bash(echo:*)", "Bash(sed -n:*)", "Bash(yarn:*)", "Bash(npm:*)", "Bash(npx:*)", "Bash(node:*)", "Bash(go:*)", "Bash(make:*)", "Bash(python3:*)", "Bash(timeout:*)", "Bash(ls:*)", "Bash(mkdir:*)"]
outward_actions: [push_branch, post_reply, add_reaction, add_label, remove_label]
sandbox_domains: [registry.npmjs.org, registry.yarnpkg.com, proxy.golang.org, sum.golang.org, storage.googleapis.com, api.openai.com, auth.openai.com, chatgpt.com]
mode: dry-run
---
Read {plugin_dir}/skills/review-responder/SKILL.md and follow it for the one merge request in the item below. You are working in a Friday-owned worktree of that merge request's branch; Mike's own checkouts are elsewhere and you must not touch them. Other agents handle other merge requests at the same time.
