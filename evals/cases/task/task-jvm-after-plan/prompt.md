---
name: task-jvm-after-plan
description: 'After a plan: SowLotService sows a lot for 0 trays; the plan rejects trays < 1 before the lot is saved.'
tags: ["task", "seeded", "jvm"]
runs: 1
max_turns: 40
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill, Agent]
---

/ambicode:task --task sv-trays --headless iteration 1 Go ahead with the plan. The repository is at `repo/`.
