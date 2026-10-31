---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:cmd/parcelctl/[\w.]+\.go:\d)'
match: not_contains
target: { source: file, path: .ambicode/tasks/plan-go-price/plan.md }
weight: 1
---
