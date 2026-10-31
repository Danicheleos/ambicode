---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:Assign\(|internal/depot/planner\.go)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-go-scans/plan.md }
weight: 1
---
