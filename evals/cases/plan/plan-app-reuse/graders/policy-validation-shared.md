---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:validateRange)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-app-overdue/plan.md }
weight: 3
---
