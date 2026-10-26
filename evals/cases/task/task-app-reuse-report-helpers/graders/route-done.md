---
type: regex
pattern: '"kind":"exit"[^\n]*"reason":"done"'
match: contains
target: { source: file, path: .ambicode/tasks/revenue-customer/ledger.jsonl }
weight: 1
---
