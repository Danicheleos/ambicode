---
type: regex
pattern: 'money\.(sum|toDecimal)|shared/money'
match: contains
target: { source: file, path: .ambicode/tasks/plan-app-csv/plan.md }
weight: 1
---
