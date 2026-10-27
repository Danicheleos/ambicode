---
name: task-app-due-after-plan
description: 'After a plan: Add a stored dueDate to invoices: the plan names validateRange and dueDateFor; a new validator, a bare Error or a copy of the date rule are the failure modes.'
tags: ["task", "seeded", "app", "task-tune"]
runs: 1
max_turns: 40
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill, Agent]
---

/ambicode:task --task ap-due --headless iteration 1 Go ahead with the plan.
