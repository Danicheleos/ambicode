---
type: regex
pattern: '(?:^|\n)[-*\s\x60]*([a-z]+-[a-z]+/[\w-]+)[\x60*_]*: [^\n]*\n(?:[^\n]*\n)*?[-*\s\x60]*\1[\x60*_]*: '
match: not_contains
target: { source: file, path: .ambicode/tasks/plan-app-overdue/plan.md }
weight: 1
---
