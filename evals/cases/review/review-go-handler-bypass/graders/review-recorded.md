---
type: regex
pattern: '"kind":"review"[^\n]*"stage":"recorded"'
match: contains
target: { source: file, path: .ambicode/reviews/rev-7/ledger.jsonl }
weight: 1
---
