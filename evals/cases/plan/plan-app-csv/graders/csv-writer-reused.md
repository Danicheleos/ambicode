---
type: regex
pattern: 'reports/csv\.js|toCsv'
match: contains
target: { source: file, path: repo/.ambicode/tasks/plan-app-csv/plan.md }
weight: 1
---
