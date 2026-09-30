---
name: url-implement
description: An implement request plus a Jira URL should route to task.
tags: ["trigger", "dev"]
runs: 3
max_turns: 8
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

Implement https://example.atlassian.net/browse/ORD-17 in the repository at `repo/`.
