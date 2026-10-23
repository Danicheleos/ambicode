---
type: regex
pattern: '__generated__/[\w.-]+:\d|new:[^\n]*__generated__|vendor/[\w/.-]+:\d'
match: not_contains
target: { source: file, path: repo/.ambicode/tasks/plan-mono-calibrate/plan.md }
weight: 1
---
