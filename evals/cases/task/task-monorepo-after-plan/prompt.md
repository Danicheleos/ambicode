---
name: task-monorepo-after-plan
description: 'After a plan: the dashboard checks only targetDc of a segment; the plan adds a positive-integer minutes check that throws SetpointError (422).'
tags: ["task", "seeded", "monorepo", "ts"]
runs: 1
max_turns: 40
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill, Agent]
---

/ambicode:task --task kl-minutes --headless iteration 1 Go ahead with the plan.
