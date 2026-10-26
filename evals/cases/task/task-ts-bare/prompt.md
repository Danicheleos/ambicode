---
name: task-ts-bare
description: 'a second return of the same loan publishes lending.loan-returned again and double-invoices the fee.'
tags: ["task", "bare-request", "ts"]
runs: 1
max_turns: 40
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill, Agent]
---

/ambicode:task --task lb-return-twice --headless iteration 1 Returning the same loan twice publishes lending.loan-returned twice, so its late fee is invoiced twice. Make returnItem (src/contexts/lending/application/return.ts) refuse a loan that is already returned with a DomainError coded 'already-returned', leave the first return unchanged, and add a test in test/return.test.ts.
