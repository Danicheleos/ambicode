---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:tests/(reports|invoices|shared)/[\w-]+\.test\.js)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-app-csv/plan.md }
weight: 1
---
