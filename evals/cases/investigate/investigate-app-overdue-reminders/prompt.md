---
name: investigate-app-overdue-reminders
description: 'A question about behaviour the repository may not have.'
tags: ["investigate", "depth"]
runs: 1
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

/ambicode:investigate --task inv-remind How does the app remind customers about overdue invoices: which job sends the reminder, and after how many days? Cite `path:line` for each claim. The repository is at `repo/`.
