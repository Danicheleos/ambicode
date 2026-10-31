---
type: regex
pattern: '(?:^|\n)[-*\s\x60]*(?:[a-z]+-[a-z]+/[\w-]+)[\x60*_]*: (?:applied at|not applicable)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-app-remind/plan.md }
weight: 1
---
