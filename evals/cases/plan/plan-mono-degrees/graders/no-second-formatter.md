---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:new:\s*dashboard/src/lib/format/)'
match: not_contains
target: { source: file, path: .ambicode/tasks/plan-mono-degrees/plan.md }
weight: 1
---
