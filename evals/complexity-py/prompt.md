---
name: complexity-py
description: Working-tree review of a Python fixture reworking a lookup.
tags: ["complexity", "python"]
runs: 3
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

Review the uncommitted change in the repository at `repo/`.

`repo/` is the repository under review. Change into it with `cd repo` before
running anything, and run every command from there; a command run anywhere else
is not about this change.
