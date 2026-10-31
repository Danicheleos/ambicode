---
name: plan-app-csv
description: 'A revenue CSV download already exists (shared/http.attachment, money.toDecimal, reports/csv.toCsv) beside a frozen legacy export with floating-point totals; the gateway caches /reports for an hour and the invoice page shows a void invoice at 0, so matching the page means a live path and the page''s total.'
tags: ["plan", "narrow"]
runs: 1
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill]
---

/ambicode:plan --task plan-app-csv --headless --answer plan-accept=Accept Finance wants a CSV download of the invoices: one line per invoice with id, customer id, status and the total, and a grand total line at the end. The amounts must match what the invoice page shows.
