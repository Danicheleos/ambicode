---
type: regex
pattern: '"kind":"exit"[^\n]*"reason":"done"'
match: contains
target: { source: file, path: repo/.ambicode/tasks/fix-page-noreview/ledger.jsonl }
weight: 1
---
