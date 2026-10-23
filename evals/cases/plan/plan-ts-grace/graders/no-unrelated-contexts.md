---
type: regex
pattern: 'contexts/(billing|notifications|catalog)/[\w/.-]+\.ts:\d'
match: not_contains
target: { source: file, path: repo/.ambicode/tasks/plan-ts-grace/plan.md }
weight: 1
---
