---
name: investigate-app-total-legacy
description: 'A total that the repository computes in more than one place.'
tags: ["investigate", "depth"]
runs: 1
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

/ambicode:investigate --task inv-total How is the total of an invoice worked out, tax and rounding included, and which code does it? Cite `path:line` for each claim. End your answer with a `## Files` section: one path per line, only the files that take part in the answer.
