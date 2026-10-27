---
name: task-app-refund-multi-file
description: 'A refund defect across three files of the payments module (repository sign, invoice status, bare Error), with the regression test in the factory style; the tests that guarded it were dropped from the fixture.'
tags: ["task", "multi-file", "regression-test", "task-tune"]
runs: 1
max_turns: 40
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill, Agent]
---

Refunds are broken: after a partial refund on a fully paid invoice, the invoice still shows as paid, and refunding more than was paid crashes the API. Fix both and cover them with tests.
