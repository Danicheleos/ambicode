---
name: fix-ticket
description: "\"look at the ticket and fix it\": one sentence, two verbs"
tags: ["trigger", "dev"]
runs: 3
max_turns: 4
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

Look at https://example.atlassian.net/browse/ORD-17 and fix it. The repository is at `repo/`.
