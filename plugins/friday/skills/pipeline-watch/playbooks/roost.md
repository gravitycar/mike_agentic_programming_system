# CI playbook: metarouter/roost

No roost-specific failure modes are recorded yet. Use the general rules in the Pipeline Watch skill, and prefer **Unknown** (escalate) over a guess.

roost has no per-MR review environment, so never run the review-env rebuild for roost.

When Mike settles a roost escalation and the cause turns out to be infrastructure, add a row here: the signs in the log, the class, and the action, in the same table form as `ion.md`.
