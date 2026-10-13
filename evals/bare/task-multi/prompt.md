---
name: task-multi
description: 'A refund defect whose fix spans the payments service and repository, in a project with an error hierarchy and a test factory it must use.'
tags: ["task"]
runs: 1
max_turns: 40
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill]
---

Refunds are broken: after a partial refund on a fully paid invoice, the invoice still shows as paid, and refunding more than was paid crashes the API. Put the regression test in tests/payments/payments.test.js. The repository is at `repo/`.
