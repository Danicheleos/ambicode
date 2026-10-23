---
name: task-py-after-plan
description: 'After a plan: check_hours accepts 0 and negative hours; the plan adds WindowTooShortError with the free code TW-311.'
tags: ["task", "seeded", "py"]
runs: 1
max_turns: 40
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill, Agent]
---

/ambicode:task --task tw-hours --headless iteration 1 Go ahead with the plan. The repository is at `repo/`.
