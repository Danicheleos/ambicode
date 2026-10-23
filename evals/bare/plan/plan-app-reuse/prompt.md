---
name: plan-app-reuse
description: 'A feature the repository half has: payment terms already compute a pay-by day for the invoice mail, config holds the overdue grace, validateRange compares days, the invoice page is a view that drops unknown fields and days count in Finance''s zone; a payment-plan dueDate and a legacy total are decoys.'
tags: ["plan", "narrow"]
runs: 1
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Write, Skill]
---

Write an implementation plan for this change, in iterations that can each be reviewed alone, and give the plan as your answer; do not implement it. If something is unclear, state your assumptions. Add a due date to invoices: an invoice carries a dueDate, creating one with a dueDate before its issue date is rejected, and there is a report of the overdue invoices with the amount still outstanding on each. The repository is at `repo/`.
