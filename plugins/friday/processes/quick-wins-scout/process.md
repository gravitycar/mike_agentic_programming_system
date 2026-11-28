---
description: Finds one quick win (a small Ready-for-Work story) and offers it in the inbox. Offers nothing while one is in process.
schedule: 1h
precheck: friday precheck quick-wins-scout
fan_out: items
max_parallel: 1
cwd: work
model: sonnet
max_budget_usd: 1
timeout: 20m
permission_mode: dontAsk
allowed_tools: [Read, Grep, Glob, "Bash(friday:*)"]
outward_actions: []
mode: dry-run
---
Read {plugin_dir}/skills/quick-wins-scout/SKILL.md and follow it for the candidates in the item below.
