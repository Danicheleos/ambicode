---
type: regex
pattern: '"kind":"review"[^\n]*"stage":"recorded"'
match: contains
target: { source: file, path: repo/.ambicode/tasks/fix-refund/ledger.jsonl }
weight: 1
---
