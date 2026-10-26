---
type: regex
pattern: 'app/(queries/latest|services)\.py'
match: contains
target: { source: file, path: .ambicode/tasks/plan-py-maxage/plan.md }
weight: 1
---
