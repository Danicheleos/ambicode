---
name: investigate-jvm-viability-rule
description: 'Find the rule behind a word used in several places of a hexagonal project.'
tags: ["investigate", "stack"]
runs: 1
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

Which code decides that a seed lot is viable, and where is that decision applied? Cite `path:line` for each claim. End your answer with a `## Files` section: one path per line, only the files that take part in the answer. The repository is at `repo/`.
