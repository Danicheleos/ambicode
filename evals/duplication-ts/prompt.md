---
name: duplication-ts
description: A finding that src/receipt.js re-implements the existing currency helper.
tags: ["duplication", "typescript"]
runs: 3
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

Review the uncommitted change in the repository at `repo/`.

`repo/` is the repository under review. Change into it before running anything;
commands run anywhere else are not about this change.
