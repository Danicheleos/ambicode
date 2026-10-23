---
type: regex
pattern: 'app/(queries/latest|services)\.py'
match: contains
target: { source: file, path: repo/.ambicode/tasks/plan-py-maxage/plan.md }
weight: 1
---
