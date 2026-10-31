---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:validateBoolean)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-app-remind/plan.md }
weight: 1
---
