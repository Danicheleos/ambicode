---
type: regex
pattern: '"stage":"apply"'
match: contains
target: { source: file, path: .ambicode/tasks/rules-ds/ledger.jsonl }
weight: 1
---
