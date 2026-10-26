---
type: regex
pattern: 'invoices/summary\.js|summarize|\bview\b|displayTotal|(service|invoices)\.total\b'
match: contains
target: { source: file, path: .ambicode/tasks/plan-app-csv/plan.md }
weight: 1
---
