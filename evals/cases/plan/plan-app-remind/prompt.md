---
name: plan-app-remind
description: 'A large multi-step feature across invoices, customers and notifications: the due date comes from the payment terms and must be kept since terms change, overdue from the configured grace, days in Finance''s zone, the preference must pass the PATCH whitelist, the flag already exists, and src/notifications must not require invoices.'
tags: ["plan", "narrow"]
runs: 1
max_turns: 40
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill]
---

/ambicode:plan --task plan-app-remind --headless --answer plan-accept=Accept Send customers an email reminder when an invoice is overdue. A reminder for an invoice goes out at most once a day while it is unpaid and overdue. Customers can switch reminders off and on themselves, separately from receipts. It ships switched off.
