---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:domain/events/)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-jvm-chill/plan.md }
weight: 1
---
