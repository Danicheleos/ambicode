---
type: regex
pattern: '"kind":"review"[^\n]*"stage":"recorded"'
match: contains
target: { source: file, path: repo/.ambicode/reviews/rev-10/ledger.jsonl }
weight: 1
---
