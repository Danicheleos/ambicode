---
type: regex
pattern: 'Goal[\s\S]*Changes[\s\S]*Accept[\s\S]*Checks[\s\S]*Leaves out'
match: contains
target: { source: file, path: repo/.ambicode/tasks/plan-ts-reserve/plan.md }
weight: 1
---
