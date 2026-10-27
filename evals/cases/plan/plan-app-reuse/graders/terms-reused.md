---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:dueDateFor|terms\.js)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-app-overdue/plan.md }
weight: 2
---
