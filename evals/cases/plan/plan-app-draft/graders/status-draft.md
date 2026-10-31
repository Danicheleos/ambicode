---
type: regex
pattern: 'status: draft'
match: contains
target: { source: file, path: .ambicode/tasks/plan-app-draft/plan.md }
weight: 1
---
