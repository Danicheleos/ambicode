---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:require_fresh)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-py-ingest/plan.md }
weight: 1
---
