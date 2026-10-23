---
type: regex
pattern: '"kind":"format"'
match: contains
target: { source: file, path: repo/.ambicode/tasks/fix-refund/ledger.jsonl }
weight: 1
---
