---
name: url-plan
description: An approach-before-code request plus a Jira URL should route to plan.
tags: ["trigger"]
runs: 3
max_turns: 8
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

Think through an implementation approach for https://example.atlassian.net/browse/ORD-17 before any code is written. The repository is at `repo/`.
