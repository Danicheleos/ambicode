---
type: regex
pattern: 'overdueGraceDays'
match: contains
target: { source: file, path: repo/.ambicode/tasks/plan-app-overdue/plan.md }
weight: 2
---
