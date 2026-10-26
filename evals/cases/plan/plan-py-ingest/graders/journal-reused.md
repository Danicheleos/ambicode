---
type: regex
pattern: 'JournalStore|infra/store/journal\.py'
match: contains
target: { source: file, path: .ambicode/tasks/plan-py-ingest/plan.md }
weight: 1
---
