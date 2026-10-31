---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:formatDc)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-mono-degrees/plan.md }
weight: 1
---
