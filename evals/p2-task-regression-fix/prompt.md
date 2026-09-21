---
name: p2-task-regression-fix
description: A source-only bug-fix task that must select and run an unchanged affected test.
tags: ["p2", "task", "typescript", "verification"]
runs: 3
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

In the repository at `repo/`, there is an uncommitted change to `src/math.js`
that a teammate believes introduced a bug in `add`. Find it, fix it, and
verify the fix.

`repo/` is the repository under review. Change into it with `cd repo` before
running anything, and run every command from there; a command run anywhere
else is not about this change.
