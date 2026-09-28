---
name: p2-task-trivial
description: A trivial, clearly bounded direct task with no plan and no expected task note.
tags: ["p2", "task", "typescript"]
runs: 3
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

In the repository at `repo/`, add a new exported function `double` to
`src/index.ts` that takes a number and returns it multiplied by two.

`repo/` is the repository under review. Change into it with `cd repo` before
running anything, and run every command from there; a command run anywhere
else is not about this change.

This is a small, self-contained request. Implement it directly.
