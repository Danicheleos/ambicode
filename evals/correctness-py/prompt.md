---
name: correctness-py
description: A finding on src/users.py naming the removed None guard.
tags: ["correctness", "python"]
runs: 3
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

Review the uncommitted change in the repository at `repo/`.

`repo/` is the repository under review. Change into it before running anything;
commands run anywhere else are not about this change.
