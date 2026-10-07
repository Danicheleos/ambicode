---
name: collide-verify
description: "collides with a built-in verify phrasing"
tags: ["trigger", "test"]
runs: 3
max_turns: 4
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

Verify that my uncommitted change in the repository at `repo/` is correct and complete.
