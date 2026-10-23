---
type: regex
pattern: '(import|from|require)[^\n]*(lending|catalog|members|notifications|billing)/(domain|application|http|channels)/'
match: not_contains
target: { source: file, path: repo/.ambicode/tasks/plan-ts-reserve/plan.md }
weight: 1
---
