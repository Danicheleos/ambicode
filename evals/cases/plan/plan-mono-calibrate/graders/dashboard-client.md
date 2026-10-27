---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:dashboard/src/(lib/engine|services)/)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-mono-calibrate/plan.md }
weight: 1
---
