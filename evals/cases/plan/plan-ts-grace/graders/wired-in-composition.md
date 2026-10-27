---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:src/composition\.ts)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-ts-grace/plan.md }
weight: 1
---
