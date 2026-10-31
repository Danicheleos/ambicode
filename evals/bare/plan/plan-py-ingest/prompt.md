---
name: plan-py-ingest
description: 'A feature across all layers of a Python service: command line, api handler, ingest command, domain event and rule, settings, wiring and the journal store, reusing the adapter registry and the freshness rule.'
tags: ["plan", "huge"]
runs: 1
max_turns: 45
timeout_seconds: 1500
allowed_tools: [Read, Glob, Grep, Bash, Write, Skill]
---

Write an implementation plan for this change, in iterations that can each be reviewed alone, and give the plan as your answer; do not implement it. If something is unclear, state your assumptions. Pilot offices should be able to feed a file from one of the existing source adapters (buoy_csv, weir_levels and the rest) into the service, from the command line and through an api handler. A reading above a per-gauge alarm level (default 4800 mm, settable by environment variable) raises an alarm event on the bus, and every alarm is kept in the journal so it can be audited. Readings older than the staleness limit are rejected at ingest with a TW error code.
