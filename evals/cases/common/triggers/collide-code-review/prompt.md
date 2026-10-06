---
name: collide-code-review
description: "collides with the built-in code-review phrasing"
tags: ["trigger", "dev"]
runs: 3
max_turns: 4
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

Do a code review of my changes in the repository at `repo/`.
