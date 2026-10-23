---
name: plan-app-remind
description: 'A large multi-step feature: due date, opt-out, template, delivery and a once-a-day record, with a feature flag that already exists unused and a frozen legacy mail as decoy.'
tags: ["plan", "narrow"]
runs: 1
max_turns: 40
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Bash, Write, Skill]
---

Write an implementation plan for this change, in iterations that can each be reviewed alone, and give the plan as your answer; do not implement it. If something is unclear, state your assumptions. Send customers an email reminder when an invoice is overdue. Invoices have no due date today, so they need one. A reminder goes out at most once a day while the invoice is unpaid and past due. Customers can opt out of reminders separately from receipts. It ships switched off. The repository is at `repo/`.
