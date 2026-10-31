---
name: investigate-ts-extend-late-fee
description: 'Work out a late fee from a loan that was extended, across the lending and billing contexts of a bounded-context service.'
tags: ["investigate", "stack"]
runs: 1
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

/ambicode:investigate --task inv-extend A tool is borrowed on 2026-03-02 and its loan is extended three times with the extend use case, then the tool is returned on 2026-04-01. What late fee does the code work out for that return, from which due date, and what happens to the fee afterwards? Cite `path:line` for each claim. End your answer with a `## Files` section: one path per line, only the files that take part in the answer.
