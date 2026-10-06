---
name: url-review
description: A review request plus a Jira URL should route to review.
tags: ["trigger", "test"]
runs: 3
max_turns: 8
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

Review my uncommitted changes in the repository at `repo/` against https://example.atlassian.net/browse/ORD-17.
