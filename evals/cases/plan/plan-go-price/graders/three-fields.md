---
type: regex
pattern: 'Goal[\s\S]*Changes[\s\S]*Checks'
match: contains
target: { source: file, path: repo/.ambicode/tasks/plan-go-price/plan.md }
weight: 1
---
