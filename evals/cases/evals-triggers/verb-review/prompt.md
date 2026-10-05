---
name: verb-review
description: "The plain review phrasing, plus the order contract: the skill loads before the helper runs."
tags: ["trigger", "dev"]
runs: 3
max_turns: 8
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

Review the uncommitted change in the repository at `repo/`.
