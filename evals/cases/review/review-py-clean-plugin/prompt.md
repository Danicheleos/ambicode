---
name: review-py-clean-plugin
description: 'Local review of an uncommitted change on py-service-tidewatch.'
tags: ["review"]
runs: 1
max_turns: 20
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

/ambicode:review --task rev-6 --headless --answer estimate=run Cite `path:line` for each claim. The repository is at `repo/`.
