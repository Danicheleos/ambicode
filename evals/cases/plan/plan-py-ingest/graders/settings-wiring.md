---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:infra/config/(settings|env)\.py[\s\S]*infra/wiring\.py|infra/wiring\.py[\s\S]*infra/config/(settings|env)\.py)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-py-ingest/plan.md }
weight: 1
---
