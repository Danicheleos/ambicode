---
type: regex
pattern: 'cmd/parcelctl/[\w.]+\.go:\d'
match: not_contains
target: { source: file, path: .ambicode/tasks/plan-go-price/plan.md }
weight: 1
---
