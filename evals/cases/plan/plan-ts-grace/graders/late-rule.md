---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:contexts/lending/domain/)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-ts-grace/plan.md }
weight: 1
---
