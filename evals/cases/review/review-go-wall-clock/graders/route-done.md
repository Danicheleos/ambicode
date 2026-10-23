---
type: regex
pattern: '"kind":"exit"[^\n]*"reason":"done"'
match: contains
target: { source: file, path: repo/.ambicode/reviews/rev-9/ledger.jsonl }
weight: 1
---
