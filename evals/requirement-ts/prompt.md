---
name: requirement-ts
description: A finding that the implementation retries once, immediately, and discards the original error.
tags: ["requirement", "typescript"]
runs: 3
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

Review the uncommitted change in this repository against this requirement:

> Outbound calls retry up to three times with exponential backoff, and give up with the original error.

The repository is in `repo/`.
