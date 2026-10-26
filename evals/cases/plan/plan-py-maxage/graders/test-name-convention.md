---
type: regex
pattern: 'test_[a-z]+__[a-z_]+'
match: contains
target: { source: file, path: .ambicode/tasks/plan-py-maxage/plan.md }
weight: 1
---
