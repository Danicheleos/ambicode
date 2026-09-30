---
name: casual-look
description: "a ticket URL with a soft verb"
tags: ["trigger", "test"]
runs: 3
max_turns: 4
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

Can you take a look at https://example.atlassian.net/browse/ORD-17? The repository is at `repo/`.
