---
name: plan-policy-staged
description: 'A plan run: the draft reads the whole plan rules from the step policy file (one policy ledger row for plan), the plan cites each applicable rule by id and respects a staged rule.'
tags: ["plan", "rules"]
runs: 1
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill]
---

/ambicode:plan --task rpl-1 --headless --answer plan-accept=Accept Refuse a payment of zero or negative cents in applyPayment and leave the invoice unpaid.
