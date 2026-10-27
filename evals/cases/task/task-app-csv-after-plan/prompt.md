---
name: task-app-csv-after-plan
description: 'After a plan: An invoices CSV that must print the invoice page''s totals: the plan names toDecimal, attachment and the page rule; copying the void-is-zero rule into reports, floating-point money or a fat route are the failure modes.'
tags: ["task", "seeded", "app", "task-tune"]
runs: 1
max_turns: 40
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill, Agent]
---

/ambicode:task --task ap-csv --headless iteration 1 Go ahead with the plan.
