---
name: investigate-nomatch
description: 'A question about code that does not exist: the scope gate must be raised and nothing invented.'
tags: ["investigate", "gate"]
runs: 1
max_turns: 12
timeout_seconds: 420
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

/ambicode:investigate --task inv-none Where is the WebSocket reconnect backoff implemented, and what is its maximum delay? The repository is at `repo/`.
