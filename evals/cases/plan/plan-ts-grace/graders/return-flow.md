---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:contexts/lending/application/return\.ts)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-ts-grace/plan.md }
weight: 1
---
