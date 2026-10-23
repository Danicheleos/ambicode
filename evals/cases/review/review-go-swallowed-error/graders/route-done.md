---
type: regex
pattern: '"kind":"exit"[^\n]*"reason":"done"'
match: contains
target: { source: file, path: repo/.ambicode/reviews/rev-8/ledger.jsonl }
weight: 1
---
