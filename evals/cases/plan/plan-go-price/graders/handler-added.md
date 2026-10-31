---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:internal/httpapi/\w+\.go)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-go-price/plan.md }
weight: 1
---
