---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:app/commands/)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-py-ingest/plan.md }
weight: 1
---
