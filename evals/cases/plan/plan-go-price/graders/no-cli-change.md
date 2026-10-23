---
type: regex
pattern: 'cmd/parcelctl/[\w.]+\.go:\d'
match: not_contains
target: { source: file, path: repo/.ambicode/tasks/plan-go-price/plan.md }
weight: 1
---
