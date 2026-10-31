---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:toDecimal)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-app-csv/plan.md }
weight: 2
---
