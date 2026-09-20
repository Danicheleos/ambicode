---
name: regression-ts
description: tests/math.test.js is identified as affected although it did not change.
tags: ["regression", "typescript", "verification"]
runs: 3
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

Review the uncommitted change in this repository and verify it against the project's own checks.

The repository is in `repo/`.
