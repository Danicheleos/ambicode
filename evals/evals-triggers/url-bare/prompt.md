---
name: url-bare
description: "A bare Jira URL with no verb: which skill claims it? Diagnostic — read the per-grader pattern, not the score."
tags: ["trigger"]
runs: 3
max_turns: 8
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

The repository is at `repo/`; run every command from inside it.

https://example.atlassian.net/browse/ORD-17
