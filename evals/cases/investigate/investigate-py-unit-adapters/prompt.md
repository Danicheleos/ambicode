---
name: investigate-py-unit-adapters
description: 'Pick the odd ones out among twelve near-identical feed adapters.'
tags: ["investigate", "stack"]
runs: 1
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

/ambicode:investigate --task inv-units Which of the gauge feed adapters do not report water levels in millimetres, and how does each of them convert to millimetres? Cite `path:line` for each claim. End your answer with a `## Files` section: one path per line, only the files that take part in the answer. The repository is at `repo/`.
