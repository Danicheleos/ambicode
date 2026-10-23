---
name: investigate-mono-cli-target
description: 'Follow a Rust workspace command through its crates.'
tags: ["investigate", "stack"]
runs: 1
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

What does the engine command line tool do with the argument `glaze`: how is the target temperature chosen for each minute, and what sets the power of the simulated kiln? Cite `path:line` for each claim. End your answer with a `## Files` section: one path per line, only the files that take part in the answer. The repository is at `repo/`.
