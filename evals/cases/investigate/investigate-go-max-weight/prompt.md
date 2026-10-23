---
name: investigate-go-max-weight
description: 'Find where a limit lives in a repository of small packages.'
tags: ["investigate", "stack"]
runs: 1
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

/ambicode:investigate --task inv-weight What is the heaviest parcel parcelhub can price, and where is that limit enforced? Cite `path:line` for each claim. End your answer with a `## Files` section: one path per line, only the files that take part in the answer. The repository is at `repo/`.
