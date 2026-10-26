---
type: regex
pattern: 'Goal[\s\S]*Changes[\s\S]*Checks'
match: contains
target: { source: file, path: .ambicode/tasks/plan-go-price/plan.md }
weight: 1
---
