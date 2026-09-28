---
name: p2-plan-path-scoped-policy
description: A plan touching a path-scoped policy pack, to check that scoped guidance surfaces and stays scoped.
tags: ["p2", "plan", "typescript", "policy"]
runs: 3
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

In the repository at `repo/`, plan adding order-cancellation support: a new
`cancel(orderId)` function belongs somewhere in the orders code.

`repo/` is the repository under review. Change into it with `cd repo` before
running anything, and run every command from there; a command run anywhere
else is not about this change.

This repository has project-specific policy configured. Apply whatever
`ambicode prepare` returns for the paths this plan touches.
