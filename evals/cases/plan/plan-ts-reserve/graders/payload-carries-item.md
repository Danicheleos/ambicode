---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:payload[^\n]*itemId|itemId[^\n]*payload)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-ts-reserve/plan.md }
weight: 1
---
