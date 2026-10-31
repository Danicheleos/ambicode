---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:bus/Topic\.kt)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-jvm-chill/plan.md }
weight: 1
---
