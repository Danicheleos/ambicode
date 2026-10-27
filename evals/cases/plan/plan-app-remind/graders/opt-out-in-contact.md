---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:contactFor)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-app-remind/plan.md }
weight: 1
---
