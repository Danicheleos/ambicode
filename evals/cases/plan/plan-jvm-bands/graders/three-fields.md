---
type: regex
pattern: 'Goal[\s\S]*Changes[\s\S]*Checks'
match: contains
target: { source: file, path: .ambicode/tasks/plan-jvm-bands/plan.md }
weight: 1
---
