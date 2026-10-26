---
name: review-ts-strategy
description: 'Local review of an uncommitted change on ts-service-lendbox.'
tags: ["review"]
runs: 1
max_turns: 20
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

/ambicode:review --task rev-2 --headless --answer estimate=run Cite `path:line` for each claim.
