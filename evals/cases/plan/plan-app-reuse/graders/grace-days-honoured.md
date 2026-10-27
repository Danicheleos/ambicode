---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:overdueGraceDays)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-app-overdue/plan.md }
weight: 2
---
