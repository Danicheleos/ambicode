---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:plugin_named)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-py-ingest/plan.md }
weight: 1
---
