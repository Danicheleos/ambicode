---
name: plan-app-reuse
description: 'A feature the shared validators, the money helpers and the reports module already carry; a frozen legacy copy and a payment-plan dueDate are decoys.'
tags: ["plan", "narrow"]
runs: 1
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Write, Skill]
---

/ambicode:plan --task plan-app-overdue --headless --answer plan-accept=Accept Add a due date to invoices: an invoice carries a dueDate, creating one with a dueDate before its issue date is rejected, and there is a report of the overdue invoices with the amount still outstanding on each. The repository is at `repo/`.
