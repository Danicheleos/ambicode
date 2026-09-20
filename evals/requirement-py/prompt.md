---
name: requirement-py
description: A finding that clamping to zero accepts input the requirement rejects.
tags: ["requirement", "python"]
runs: 3
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

Review the uncommitted change in this repository against this requirement:

> A negative order amount is rejected with a validation error. It is never coerced.

The repository is in `repo/`.
