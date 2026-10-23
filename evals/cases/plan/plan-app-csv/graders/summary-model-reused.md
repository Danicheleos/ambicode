---
type: regex
pattern: 'invoices/summary\.js|summarize'
match: contains
target: { source: file, path: repo/.ambicode/tasks/plan-app-csv/plan.md }
weight: 1
---
