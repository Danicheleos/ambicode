---
name: plan-jvm-bands
description: 'Small change in a hexagonal Kotlin service: the banding helper exists unused in application, the report type is in the input port, and the REST json helper cannot carry a nested map.'
tags: ["plan", "small"]
runs: 1
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Write, Skill]
---

Write an implementation plan for this change, in iterations that can each be reviewed alone, and give the plan as your answer; do not implement it. If something is unclear, state your assumptions. The stock report should show how many lots are excellent, viable and weak, next to the viable count, in the REST report and in the CLI report table. The repository is at `repo/`.
