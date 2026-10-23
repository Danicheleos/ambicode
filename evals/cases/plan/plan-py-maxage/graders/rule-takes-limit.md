---
type: regex
pattern: 'rules/(staleness|limits)\.py'
match: contains
target: { source: file, path: repo/.ambicode/tasks/plan-py-maxage/plan.md }
weight: 1
---
