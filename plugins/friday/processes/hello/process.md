---
description: Test process. Says hello and raises one sample escalation, to prove the inbox end to end.
schedule: manual
precheck: friday precheck hello
cwd: work
model: haiku
max_budget_usd: 0.25
timeout: 5m
permission_mode: dontAsk
allowed_tools: ["Bash(friday:*)"]
outward_actions: []
mode: live
---
This is Friday's test process. Do not use any tools.

Reply with one short sentence saying hello. Then raise exactly one test escalation, using this exact line in your ESCALATIONS block:

- general | hello-test | Test escalation from Friday's hello process. Click to resume this session and say "done".

If Mike later resumes this session and says "done", reply "Thanks, Mike." and then run `friday settle --cwd "$PWD" --reason "hello test finished"`.
