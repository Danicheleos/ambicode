---
type: regex
pattern: '"stage":"apply"'
match: contains
target: { source: file, path: .ambicode/tasks/rules-mig/ledger.jsonl }
weight: 1
---
