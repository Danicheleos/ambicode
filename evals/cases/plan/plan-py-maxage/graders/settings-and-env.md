---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:config/env\.py)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-py-maxage/plan.md }
weight: 1
---
