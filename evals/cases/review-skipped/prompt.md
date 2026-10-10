---
name: review-skipped
description: 'No gate answer: the estimate gate defaults to skip, no reviewer runs and no finding may be reported.'
tags: ["review", "gate"]
runs: 1
max_turns: 20
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

/ambicode:review --task rev-skip --headless The repository is at `repo/`.
