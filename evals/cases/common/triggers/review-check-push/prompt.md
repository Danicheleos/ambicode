---
name: review-check-push
description: "\"check my changes before I push\""
tags: ["trigger", "test"]
runs: 3
max_turns: 4
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

Can you check my changes in the repository at `repo/` before I push? Is anything wrong with them?
