---
name: review-defect
description: 'An uncommitted off-by-one: the reviewer subagent runs, the finding is recorded and read back with its location.'
tags: ["review"]
runs: 1
max_turns: 20
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

/ambicode:review --task rev-page --headless --answer estimate=run The repository is at `repo/`.
