---
type: regex
pattern: 'internal/httpapi/\w+\.go'
match: contains
target: { source: file, path: repo/.ambicode/tasks/plan-go-price/plan.md }
weight: 1
---
