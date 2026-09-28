---
name: verb-implement
description: A plain implement request with no URL should route to task.
tags: ["trigger"]
runs: 3
max_turns: 8
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

In the repository at `repo/`, add a `clamp(value, low, high)` helper beside the existing utility code.
