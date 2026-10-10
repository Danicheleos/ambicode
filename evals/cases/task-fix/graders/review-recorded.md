---
type: regex
pattern: '"kind":"review"[^\n]*"stage":"recorded"'
match: contains
target: { source: file, path: repo/.ambicode/tasks/fix-page/ledger.jsonl }
weight: 1
---
