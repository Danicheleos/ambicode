---
type: regex
pattern: 'api/handlers/[a-z_]+\.py'
match: contains
target: { source: file, path: repo/.ambicode/tasks/plan-py-ingest/plan.md }
weight: 1
---
