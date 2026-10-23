---
name: investigate-jvm-sow-mail
description: 'Follow an event from a use case to the message it produces in a hexagonal project.'
tags: ["investigate", "stack"]
runs: 1
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

/ambicode:investigate --task inv-sow When a seed lot is sown, who is notified, and by what path does that message get there? Cite `path:line` for each claim. End your answer with a `## Files` section: one path per line, only the files that take part in the answer. The repository is at `repo/`.
