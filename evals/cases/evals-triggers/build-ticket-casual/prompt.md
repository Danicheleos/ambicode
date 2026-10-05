---
name: build-ticket-casual
description: "a casual build request naming the ticket inline"
tags: ["trigger", "dev"]
runs: 3
max_turns: 4
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

ORD-17 (https://example.atlassian.net/browse/ORD-17) — please build it in the repository at `repo/`.
