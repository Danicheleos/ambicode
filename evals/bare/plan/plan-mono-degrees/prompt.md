---
name: plan-mono-degrees
description: 'Small change in a monorepo: one dashboard view prints a raw _dc value, a formatter for the display edge already exists, and engine, tools, generated and vendored code are out of scope.'
tags: ["plan", "small"]
runs: 1
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Write, Skill]
---

Write an implementation plan for this change, in iterations that can each be reviewed alone, and give the plan as your answer; do not implement it. If something is unclear, state your assumptions. On the firing page, show each segment's target temperature in degrees Celsius, not in tenths.
