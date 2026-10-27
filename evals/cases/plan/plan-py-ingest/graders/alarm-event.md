---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:domain/events/)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-py-ingest/plan.md }
weight: 1
---
