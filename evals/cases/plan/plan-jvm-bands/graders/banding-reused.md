---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:viabilityBands)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-jvm-bands/plan.md }
weight: 1
---
