---
name: task-app-reuse-report-helpers
description: 'A new report that must go through the reports service''s own groupBy and total, not a new grouping loop, with its route and a test.'
tags: ["task", "reuse", "task-tune"]
runs: 1
max_turns: 40
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill, Agent]
---

/ambicode:task --task revenue-customer --headless iteration 1 Add a revenue-by-customer report (revenueByCustomer): the totals of fully paid invoices grouped by customer id, in the same row shape as the other customer report, served at GET /reports/revenue-by-customer, with tests.
