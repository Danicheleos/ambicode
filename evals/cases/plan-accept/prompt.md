---
name: plan-accept
description: 'A plan that the user accepts headlessly: draft written, anchors checked, promoted, no code touched.'
tags: ["plan", "gate"]
runs: 1
max_turns: 16
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Bash, Write, Skill]
---

/ambicode:plan --task plan-due --headless --answer plan-accept=Accept Add a dueDate field to invoices: the model carries it, total() is unchanged, the invoices route returns it, and creating an invoice with a dueDate in the past is rejected. The repository is at `repo/`.
