---
type: regex
pattern: 'new:\s*src/tidewatch/plugins'
match: not_contains
target: { source: file, path: .ambicode/tasks/plan-py-ingest/plan.md }
weight: 1
---
