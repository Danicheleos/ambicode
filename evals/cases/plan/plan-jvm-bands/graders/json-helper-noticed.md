---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:Json\.kt|server/Json|[Ff]latten|nested|[Mm]ap[^\n]*(string|quote|toString))'
match: contains
target: { source: file, path: .ambicode/tasks/plan-jvm-bands/plan.md }
weight: 1
---
