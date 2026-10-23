---
type: regex
pattern: '(^|\W)/invoices(\.csv\b|/[\w.-]*(csv|export|download)|\?format=csv)'
match: contains
target: { source: file, path: repo/.ambicode/tasks/plan-app-csv/plan.md }
weight: 3
---
