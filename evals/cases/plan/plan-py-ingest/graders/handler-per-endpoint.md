---
type: regex
pattern: 'api/handlers/[a-z_]+\.py'
match: contains
target: { source: file, path: .ambicode/tasks/plan-py-ingest/plan.md }
weight: 1
---
