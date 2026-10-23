---
type: regex
pattern: 'contexts/billing/[\w/.-]+\.ts:\d'
match: not_contains
target: { source: file, path: repo/.ambicode/tasks/plan-ts-reserve/plan.md }
weight: 1
---
