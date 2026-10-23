---
name: investigate-py-calibrate-ties
description: 'Follow a correction applied to stored readings through the store and the query that reads them back, in a layered service.'
tags: ["investigate", "stack"]
runs: 1
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

The only reading of the gauge dover, taken a minute ago, is 1000 mm. Then `calibrate(services, "dover", offset_mm=20)` runs. What level does `current_level` report for dover afterwards, and why? Cite `path:line` for each claim. End your answer with a `## Files` section: one path per line, only the files that take part in the answer. The repository is at `repo/`.
