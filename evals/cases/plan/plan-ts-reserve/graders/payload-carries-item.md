---
type: regex
pattern: 'payload[^\n]*itemId|itemId[^\n]*payload'
match: contains
target: { source: file, path: .ambicode/tasks/plan-ts-reserve/plan.md }
weight: 1
---
