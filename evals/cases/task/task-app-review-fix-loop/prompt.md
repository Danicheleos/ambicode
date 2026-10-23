---
name: task-app-review-fix-loop
description: 'New behaviour behind a flag in a project with rules (flag, opt-out, templates, factory tests); no iteration is named, so the independent review runs and its findings, if any, go back to the fix step.'
tags: ["task", "review", "fix-loop"]
runs: 1
max_turns: 60
timeout_seconds: 1800
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill, Agent]
---

/ambicode:task --task refund-mail --headless Mail the customer when a refund is recorded: onPaymentRefunded in src/notifications/handlers.js only logs today. Reuse the existing delivery and template style, respect customers who opted out of receipts, and ship it behind a new flag refundEmails, off by default. Test it in tests/notifications/handlers.test.js. The repository is at `repo/`.
