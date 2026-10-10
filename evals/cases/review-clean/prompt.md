---
name: review-clean
description: 'A docstring-only Python change: no behavioural defect may be asserted, and the verification gap still has to be stated.'
tags: ["review"]
runs: 1
max_turns: 20
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

/ambicode:review --task rev-clean --headless --answer estimate=run The repository is at `repo/`.
