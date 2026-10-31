---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:(import|from|require)[^\n]*members/(domain|application|http)/)'
match: not_contains
target: { source: file, path: .ambicode/tasks/plan-ts-grace/plan.md }
weight: 1
---
