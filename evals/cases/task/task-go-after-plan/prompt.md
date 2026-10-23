---
name: task-go-after-plan
description: 'After a plan: rates.CentsFor prices a 0-gram parcel at the first band; the plan returns core.ErrInvalid wrapped as rates.CentsFor.'
tags: ["task", "seeded", "go"]
runs: 1
max_turns: 40
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill, Agent]
---

/ambicode:task --task ph-weight --headless iteration 1 Go ahead with the plan. The repository is at `repo/`.
