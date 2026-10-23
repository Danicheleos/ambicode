---
name: investigate-go-quote-price
description: 'Work out a printed price from a command line call across small packages.'
tags: ["investigate", "stack"]
runs: 1
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

/ambicode:investigate --task inv-quote What does `parcelctl PH-7 1200 north` print for the price, and which code decides each part of that number? Cite `path:line` for each claim. End your answer with a `## Files` section: one path per line, only the files that take part in the answer. The repository is at `repo/`.
