---
description: Retries infrastructure failures in my MR pipelines, rebuilds broken ion review envs, and reports code failures.
schedule: 10m
precheck: friday precheck pipeline-watch
fan_out: items
max_parallel: 3
cwd: work
model: sonnet
max_budget_usd: 2
timeout: 45m
permission_mode: dontAsk
allowed_tools: [Read, Grep, Glob, "Bash(friday:*)", "Bash(unzip:*)", "Bash(mkdir:*)", "Bash(ls:*)", "Bash(cat:*)", "Bash(head:*)", "Bash(tail:*)", "Bash(grep:*)", "Bash(wc:*)", "Bash(echo:*)", "Bash(sed -n:*)"]
outward_actions: [retry_job, play_job, rebuild_review_env, add_label, remove_label]
sandbox_domains: []
mode: dry-run
---
Read {plugin_dir}/skills/pipeline-watch/SKILL.md and follow it for the one merge request in the item below. Other agents handle other merge requests at the same time; touch no other merge request.
