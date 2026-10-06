---
name: how-much-work
description: "a cost question about a change"
tags: ["trigger", "dev"]
runs: 3
max_turns: 4
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

How much work would it be to add caching to the module in the repository at `repo/`? I only want to know what it would touch.
