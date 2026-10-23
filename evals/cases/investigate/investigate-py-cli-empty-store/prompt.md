---
name: investigate-py-cli-empty-store
description: 'Follow a command line call through a layered service to the text it prints.'
tags: ["investigate", "stack"]
runs: 1
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

/ambicode:investigate --task inv-cli What does `python -m tidewatch.cli.main dover 6` print when the program has just started, and why? Cite `path:line` for each claim. End your answer with a `## Files` section: one path per line, only the files that take part in the answer. The repository is at `repo/`.
