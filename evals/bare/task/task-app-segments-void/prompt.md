---
name: task-app-segments-void
description: 'customers/segments.js counts void invoices in the lifetime spend although reports/top-customers.js excludes them; the fix must keep the three existing tests and add one regression test.'
tags: ["task", "existing-tests", "regression-test"]
runs: 1
max_turns: 40
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill, Agent]
---

customers/segments.js counts void invoices in lifetimeCents and in describe, so a customer whose large invoice was voided is still gold, while reports/top-customers.js excludes them. Exclude void invoices from both, and add the regression test to tests/customers/segments.test.js.
