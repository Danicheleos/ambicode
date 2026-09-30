---
name: review-vs-ticket
description: "does the change do what the ticket asks"
tags: ["trigger", "test"]
runs: 3
max_turns: 4
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

Does the uncommitted change in the repository at `repo/` actually do what https://example.atlassian.net/browse/ORD-17 asks for?
