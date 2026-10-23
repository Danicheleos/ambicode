---
name: plan-app-draft
description: 'No gate answer is given: the plan stays a draft, the gate is printed, nothing is promoted, and the closing message must not call the plan accepted.'
tags: ["plan", "gate"]
runs: 1
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Write, Skill]
---

/ambicode:plan --task plan-app-draft Send the customer an email when a payment is refunded. Today the refund handler only logs it. The repository is at `repo/`.
