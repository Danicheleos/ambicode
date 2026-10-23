---
name: plan-app-vague
description: 'A vague request: the repository has no invoice due date, an aging report by issue date and a reminders flag that is off; the plan has to ground itself in that and say what it assumed.'
tags: ["plan", "narrow"]
runs: 1
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Write, Skill]
---

/ambicode:plan --task plan-app-vague --headless --answer plan-accept=Accept Late payers are a mess for us. Make the billing service handle them better. The repository is at `repo/`.
