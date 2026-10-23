---
type: regex
pattern: 'tests/(invoices|reports)/[\w-]+\.test\.js'
match: contains
target: { source: file, path: repo/.ambicode/tasks/plan-app-overdue/plan.md }
weight: 1
---
