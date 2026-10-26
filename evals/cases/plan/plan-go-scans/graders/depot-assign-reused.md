---
type: regex
pattern: 'Assign\(|internal/depot/planner\.go'
match: contains
target: { source: file, path: .ambicode/tasks/plan-go-scans/plan.md }
weight: 1
---
