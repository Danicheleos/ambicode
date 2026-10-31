---
name: plan-go-price
description: 'Small change in a Go service: the handler mounts everything under /parcels/ and trims that prefix, pricing already exists, and the too-heavy case surfaces as core.ErrInvalid.'
tags: ["plan", "small"]
runs: 1
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Write, Skill]
---

Write an implementation plan for this change, in iterations that can each be reviewed alone, and give the plan as your answer; do not implement it. If something is unclear, state your assumptions. Expose the price of a parcel over HTTP: GET /parcels/<tag>/price returns the price in cents. A parcel too heavy for any rate band must get a clear client error, not a 500.
