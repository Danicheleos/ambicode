---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:(^|\W)/invoices(\.csv\b|/[\w.-]*(csv|export|download)|\?format=csv))'
match: contains
target: { source: file, path: .ambicode/tasks/plan-app-csv/plan.md }
weight: 3
---
