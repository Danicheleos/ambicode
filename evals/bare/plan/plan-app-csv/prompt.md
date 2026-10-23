---
name: plan-app-csv
description: 'A frozen legacy CSV export with floating-point totals sits beside a reports CSV writer and an invoice summary read model; the plan must build on the live ones and leave legacy alone.'
tags: ["plan", "narrow"]
runs: 1
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Write, Skill]
---

Write an implementation plan for this change, in iterations that can each be reviewed alone, and give the plan as your answer; do not implement it. If something is unclear, state your assumptions. Finance wants a CSV download of the invoices: one line per invoice with id, customer id, status and the total, and a grand total line at the end. The amounts must match what the invoice page shows. The repository is at `repo/`.
