---
type: regex
pattern: 'pricing\.Quote'
match: contains
target: { source: file, path: .ambicode/tasks/plan-go-price/plan.md }
weight: 1
---
