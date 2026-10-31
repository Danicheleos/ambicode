---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:src/composition\.ts)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-ts-reserve/plan.md }
weight: 1
---
