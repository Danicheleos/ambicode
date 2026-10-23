---
type: regex
pattern: 'src/invoices/'
match: contains
target: { source: file, path: repo/.ambicode/tasks/plan-app-overdue/plan.md }
weight: 1
---
