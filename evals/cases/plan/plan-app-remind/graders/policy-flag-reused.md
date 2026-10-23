---
type: regex
pattern: 'overdueReminders'
match: contains
target: { source: file, path: repo/.ambicode/tasks/plan-app-remind/plan.md }
weight: 1
---
