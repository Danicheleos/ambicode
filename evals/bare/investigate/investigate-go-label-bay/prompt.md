---
name: investigate-go-label-bay
description: 'Trace every value printed by a command line tool back to where it comes from, across small packages.'
tags: ["investigate", "stack"]
runs: 1
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

What does `parcelctl PH-7 1200 north` print, and where does each value on its two lines come from? Cite `path:line` for each claim. End your answer with a `## Files` section: one path per line, only the files that take part in the answer.
