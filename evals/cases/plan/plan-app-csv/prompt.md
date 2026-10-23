---
name: plan-app-csv
description: 'A frozen legacy CSV export with floating-point totals sits beside a reports CSV writer and an invoice summary read model; the plan must build on the live ones and leave legacy alone.'
tags: ["plan", "narrow"]
runs: 1
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Write, Skill]
---

/ambicode:plan --task plan-app-csv --headless --answer plan-accept=Accept Finance wants a CSV download of the invoices: one line per invoice with id, customer id, status and the total, and a grand total line at the end. The amounts must match what the invoice page shows. The repository is at `repo/`.
