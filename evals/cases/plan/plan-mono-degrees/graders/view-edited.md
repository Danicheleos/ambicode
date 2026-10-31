---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:dashboard/src/views/firing\.ts)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-mono-degrees/plan.md }
weight: 1
---
