---
type: regex
pattern: '"kind":"exit"[^\n]*"reason":"done"'
match: contains
target: { source: file, path: .ambicode/tasks/ph-weight/ledger.jsonl }
weight: 1
---
