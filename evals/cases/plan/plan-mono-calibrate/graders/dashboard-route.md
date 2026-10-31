---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:dashboard/src/routes/)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-mono-calibrate/plan.md }
weight: 1
---
