---
name: investigate-mono-max-setpoint
description: 'Trace one limit across the projects of a monorepo.'
tags: ["investigate", "stack"]
runs: 1
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

Where is the maximum setpoint temperature enforced, and is it enforced in each of the three projects? Cite `path:line` for each claim. End your answer with a `## Files` section: one path per line, only the files that take part in the answer.
