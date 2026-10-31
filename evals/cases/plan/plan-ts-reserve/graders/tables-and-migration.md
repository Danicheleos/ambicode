---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:platform/db/(migrations|memory)\.ts)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-ts-reserve/plan.md }
weight: 1
---
