---
type: regex
pattern: 'new:\s*dashboard/src/lib/format/'
match: not_contains
target: { source: file, path: repo/.ambicode/tasks/plan-mono-degrees/plan.md }
weight: 1
---
