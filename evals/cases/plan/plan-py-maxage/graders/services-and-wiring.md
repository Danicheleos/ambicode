---
type: regex
pattern: 'infra/wiring\.py|app/services\.py'
match: contains
target: { source: file, path: repo/.ambicode/tasks/plan-py-maxage/plan.md }
weight: 1
---
