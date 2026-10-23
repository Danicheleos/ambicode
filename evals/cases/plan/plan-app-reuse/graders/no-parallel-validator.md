---
type: regex
pattern: 'new:\s*src/shared/(validation|dates?)/'
match: not_contains
target: { source: file, path: repo/.ambicode/tasks/plan-app-overdue/plan.md }
weight: 1
---
