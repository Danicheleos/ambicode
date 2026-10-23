---
type: regex
pattern: 'tests/(reports|invoices|shared)/[\w-]+\.test\.js'
match: contains
target: { source: file, path: repo/.ambicode/tasks/plan-app-csv/plan.md }
weight: 1
---
