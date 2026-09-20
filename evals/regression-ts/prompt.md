---
name: regression-ts
description: Working-tree review and verification of a TypeScript source-only change.
tags: ["regression", "typescript", "verification"]
runs: 3
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

Review the uncommitted change in the repository at `repo/` and verify it against
the project's own checks.

`repo/` is the repository under review. Change into it with `cd repo` before
running anything, and run every command from there; a command run anywhere else
is not about this change.
