---
name: investigate-trace
description: 'A flow that reaches its last step only through the event bus, in a repository with a frozen legacy copy of that step.'
tags: ["investigate"]
runs: 1
max_turns: 20
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

What happens when a payment is recorded, from the API call until the customer is notified? Cite `path:line` for each claim. End your answer with a `## Files` section: one path per line, only the files that take part in the answer. The repository is at `repo/`.
