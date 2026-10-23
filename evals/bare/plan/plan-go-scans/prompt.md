---
name: plan-go-scans
description: 'A feature across a Go module: http handler, tracking service, a new sentinel error, scanner parsing, depot, notify, audit and returns, wired in two commands, under the error-wrapping and injected-clock rules.'
tags: ["plan", "huge"]
runs: 1
max_turns: 45
timeout_seconds: 1500
allowed_tools: [Read, Glob, Grep, Bash, Write, Skill]
---

Write an implementation plan for this change, in iterations that can each be reviewed alone, and give the plan as your answer; do not implement it. If something is unclear, state your assumptions. Handheld scanners should report scans over HTTP: POST /parcels/<tag>/scans with a scanner line such as "PH-1042 DEP". Only forward moves are allowed (collected, at-depot, on-van, delivered); anything else is a 409. A parcel reaching the depot gets its bay assigned, every accepted scan notifies the customer and is recorded in the audit trail. A returned parcel (refused, damaged, wrong-address) goes back to the depot through the returns flow, also from the command line as `parcelctl return <tag> <reason>`. The repository is at `repo/`.
