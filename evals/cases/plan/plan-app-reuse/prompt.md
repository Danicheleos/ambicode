---
name: plan-app-reuse
description: 'A feature the repository half has: payment terms already compute a pay-by day for the invoice mail, config holds the overdue grace, validateRange compares days, the invoice page is a view that drops unknown fields and days count in Finance''s zone; a payment-plan dueDate and a legacy total are decoys.'
tags: ["plan", "narrow"]
runs: 1
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill]
---

/ambicode:plan --task plan-app-overdue --headless --answer plan-accept=Accept Add a due date to invoices: an invoice carries a dueDate, creating one with a dueDate before its issue date is rejected, and there is a report of the overdue invoices with the amount still outstanding on each.
