---
name: p2-plan-accepted-iteration
description: A plan with no open material decision, producing ordered iterations ready for /ambicode:task.
tags: ["p2", "plan", "typescript"]
runs: 3
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

In the repository at `repo/`, plan adding a `double` and a `square` function to
`src/index.ts`, each exported separately so callers can use one without the
other.

`repo/` is the repository under review. Change into it with `cd repo` before
running anything, and run every command from there; a command run anywhere
else is not about this plan.

There is no ambiguity in this request and no material design decision to
resolve — produce a complete plan rather than asking a clarifying question.
Do not implement anything.
