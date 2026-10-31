---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:GerminationRules\.kt|SowLotService\.kt)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-jvm-chill/plan.md }
weight: 1
---
