---
type: regex
pattern: 'shared/money|money\.(sum|format)'
match: contains
target: { source: file, path: repo/.ambicode/tasks/plan-app-csv/plan.md }
weight: 1
---
