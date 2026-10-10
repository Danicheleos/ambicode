---
name: plan-draft
description: 'No gate answer: the plan stays a draft and the message must not call it accepted.'
tags: ["plan", "gate"]
runs: 1
max_turns: 16
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Bash, Write, Skill]
---

/ambicode:plan --task plan-draft Add a dueDate field to invoices and return it from the invoices route. The repository is at `repo/`.
