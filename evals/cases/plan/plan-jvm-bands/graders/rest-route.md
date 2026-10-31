---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:ReportRoutes\.kt|adapters/rest)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-jvm-bands/plan.md }
weight: 1
---
