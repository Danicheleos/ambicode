---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:src/legacy/[\w.-]+:\d|new:\s*src/legacy)'
match: not_contains
target: { source: file, path: .ambicode/tasks/plan-app-overdue/plan.md }
weight: 1
---
