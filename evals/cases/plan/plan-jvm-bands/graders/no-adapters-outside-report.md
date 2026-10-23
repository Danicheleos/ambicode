---
type: regex
pattern: 'adapters/(persistence|messaging)/[\w/.-]+\.kt:\d'
match: not_contains
target: { source: file, path: repo/.ambicode/tasks/plan-jvm-bands/plan.md }
weight: 1
---
