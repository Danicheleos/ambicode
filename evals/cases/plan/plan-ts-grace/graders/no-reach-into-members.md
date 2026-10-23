---
type: regex
pattern: '(import|from|require)[^\n]*members/(domain|application|http)/'
match: not_contains
target: { source: file, path: repo/.ambicode/tasks/plan-ts-grace/plan.md }
weight: 1
---
