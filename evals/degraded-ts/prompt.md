---
name: degraded-ts
description: The uncertain affected-test set is stated as a verification gap, not a clean verdict.
tags: ["degraded-context", "typescript", "verification"]
runs: 3
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

Review the uncommitted change in this repository and verify it against the project's own checks.

The repository is in `repo/`.
