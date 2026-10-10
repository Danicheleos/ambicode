---
name: review-regression
description: 'A source-only change that breaks an unchanged test; the reviewer should see it and a check should be recorded.'
tags: ["review", "checks"]
runs: 1
max_turns: 20
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

/ambicode:review --task rev-math --headless --answer estimate=run The repository is at `repo/`.
