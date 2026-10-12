---
name: review-subtle
description: 'An uncommitted change to a shared helper whose breakage is in callers outside the diff, plus a convention violation inside it.'
tags: ["review"]
runs: 1
max_turns: 20
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

/ambicode:review --task rev-money --headless --answer estimate=run Cite `path:line` for each claim. The repository is at `repo/`.
