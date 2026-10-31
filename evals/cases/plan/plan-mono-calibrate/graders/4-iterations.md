---
type: regex
pattern: 'Goal[\s\S]*?Goal[\s\S]*?Goal[\s\S]*?Goal'
match: contains
target: { source: file, path: .ambicode/tasks/plan-mono-calibrate/plan.md }
weight: 1
---
