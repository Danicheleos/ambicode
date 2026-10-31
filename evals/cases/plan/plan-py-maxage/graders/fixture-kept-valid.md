---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:tests/conftest\.py)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-py-maxage/plan.md }
weight: 1
---
