---
name: plan-reuse
description: 'A plan for a feature the existing shared validators, money helpers and reports module already carry: it must reuse them, not rebuild them, and leave the legacy copy alone.'
tags: ["plan", "gate"]
runs: 1
max_turns: 16
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Bash, Write, Skill]
---

Write an implementation plan for this change, in iterations that can each be reviewed alone; do not implement it. Add a due date to invoices: an invoice carries a dueDate, creating one with a dueDate before its issue date is rejected, and there is a report of the overdue invoices with the amount still outstanding on each. The repository is at `repo/`.
