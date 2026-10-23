---
type: regex
pattern: 'tests/(reports|invoices)/'
match: contains
target: { source: file, path: repo/.ambicode/tasks/plan-app-csv/plan.md }
weight: 1
---
