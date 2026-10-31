---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:ErrInvalid)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-go-price/plan.md }
weight: 1
---
