---
name: investigate-ts-loan-limit
description: 'Find where a per-member limit is applied on a bounded-context service.'
tags: ["investigate", "stack"]
runs: 1
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

Where is the limit on how many tools a member may have on loan at once enforced when a loan is started? Cite `path:line` for each claim. End your answer with a `## Files` section: one path per line, only the files that take part in the answer. The repository is at `repo/`.
