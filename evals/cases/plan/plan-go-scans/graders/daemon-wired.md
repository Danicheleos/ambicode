---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:cmd/parceld/)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-go-scans/plan.md }
weight: 1
---
