---
name: task-app-segments-void
description: 'customers/segments.js counts void invoices in the lifetime spend although reports/top-customers.js excludes them; the fix must keep the three existing tests and add one regression test.'
tags: ["task", "existing-tests", "regression-test", "task-tune"]
runs: 1
max_turns: 40
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill, Agent]
---

A customer whose large invoice was voided is still classed gold, still counted in the description of their segment, and still billed on their account statement. Voided invoices must not count for any of them, as in the top customers report. Add a regression test.
