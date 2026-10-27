---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:adapters/(persistence|messaging)/[\w/.-]+\.kt:\d)'
match: not_contains
target: { source: file, path: .ambicode/tasks/plan-jvm-bands/plan.md }
weight: 1
---
