---
name: task-ts-after-plan
description: 'After a plan: extendLoan ignores canExtend/MAX_EXTENSIONS; the accepted plan counts extensions on Loan and refuses the third.'
tags: ["task", "seeded", "ts", "task-tune"]
runs: 1
max_turns: 40
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill, Agent]
---

/ambicode:task --task lb-extend --headless iteration 1 Go ahead with the plan.
