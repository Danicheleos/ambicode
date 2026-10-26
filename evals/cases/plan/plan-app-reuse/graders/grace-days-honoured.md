---
type: regex
pattern: 'overdueGraceDays'
match: contains
target: { source: file, path: .ambicode/tasks/plan-app-overdue/plan.md }
weight: 2
---
