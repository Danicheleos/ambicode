---
name: investigate-app-optout-files
description: 'Which files a change to an existing feature would edit.'
tags: ["investigate", "depth"]
runs: 1
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

Which files would change to let a customer turn off payment receipts after the account exists, through PATCH /customers/:customerId with { "receipts": false }? Cite `path:line` for each claim. End your answer with a `## Files` section: one path per line, only the files the change edits. The repository is at `repo/`.
