---
name: collide-security
description: "collides with the built-in security-review; only a wrong sibling counts as a miss"
tags: ["trigger", "dev"]
runs: 3
max_turns: 4
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

Do a security review of my pending changes in the repository at `repo/`.
