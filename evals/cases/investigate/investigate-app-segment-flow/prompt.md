---
name: investigate-app-segment-flow
description: 'Follow a customer figure across three modules.'
tags: ["investigate", "depth"]
runs: 1
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

/ambicode:investigate --task inv-segment How is the segment of a customer (gold, silver, standard) determined, which modules does its data come from, and are void invoices counted? Cite `path:line` for each claim. End your answer with a `## Files` section: one path per line, only the files that take part in the answer. The repository is at `repo/`.
