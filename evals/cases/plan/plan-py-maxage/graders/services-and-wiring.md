---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:infra/wiring\.py|app/services\.py)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-py-maxage/plan.md }
weight: 1
---
