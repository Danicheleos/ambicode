---
name: investigate-ts-late-fee-wiring
description: 'Follow a late fee from the return of a tool to the invoice on a bounded-context service.'
tags: ["investigate", "stack"]
runs: 1
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

/ambicode:investigate --task inv-fee A member returns a borrowed tool three days after its due date. How is the late fee worked out, and does the member end up with an invoice for it? Cite `path:line` for each claim. End your answer with a `## Files` section: one path per line, only the files that take part in the answer. The repository is at `repo/`.
