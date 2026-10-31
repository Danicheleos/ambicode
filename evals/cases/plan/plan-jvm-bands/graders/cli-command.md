---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:ReportCommand\.kt|adapters/cli)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-jvm-bands/plan.md }
weight: 1
---
