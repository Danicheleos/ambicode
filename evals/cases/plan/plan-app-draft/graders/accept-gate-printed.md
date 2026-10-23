---
type: regex
pattern: '"kind":"gate","gate":"plan-accept"'
match: contains
target: { source: file, path: repo/.ambicode/tasks/plan-app-draft/ledger.jsonl }
weight: 1
---
