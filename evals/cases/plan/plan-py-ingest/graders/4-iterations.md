---
type: regex
pattern: 'Goal[\s\S]*?Goal[\s\S]*?Goal[\s\S]*?Goal'
match: contains
target: { source: file, path: repo/.ambicode/tasks/plan-py-ingest/plan.md }
weight: 1
---
