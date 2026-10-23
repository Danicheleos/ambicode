---
name: review-jvm-lot-query
description: 'Local review of an uncommitted change on jvm-gradle-seedvault.'
tags: ["review"]
runs: 1
max_turns: 20
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

Review the uncommitted change in the repository at `repo/`. Cite `path:line` for each claim.
