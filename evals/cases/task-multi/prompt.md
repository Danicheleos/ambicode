---
name: task-multi
description: 'A refund defect whose fix spans the payments service and repository, in a project with an error hierarchy and a test factory it must use.'
tags: ["task", "review"]
runs: 1
max_turns: 40
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill]
---

/ambicode:task --task fix-refund --headless --answer review-offer=run Fix refunds in src/payments: after an invoice is paid in full and part of it is refunded (pay 1106 cents, refund 300) the invoice still has status paid instead of partially_paid, and refunding more than was paid answers with a 500 instead of a client error. Put the regression test in tests/payments/payments.test.js. The repository is at `repo/`.
