---
name: investigate-app-segment-flow-2
description: 'A figure that changes with no new data: the cause is two modules and a setting away from the symptom.'
tags: ["investigate", "depth"]
runs: 1
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

A customer was gold last year and is silver today. What made their segment change, and what would put them back to gold? Cite `path:line` for each claim. End your answer with a `## Files` section: one path per line, only the files that take part in the answer.
