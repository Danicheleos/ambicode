---
type: regex
pattern: '"kind":"format"'
match: contains
target: { source: file, path: repo/.ambicode/tasks/fix-page/ledger.jsonl }
weight: 1
---
