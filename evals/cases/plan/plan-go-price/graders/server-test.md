---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:\w+_test\.go)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-go-price/plan.md }
weight: 1
---
