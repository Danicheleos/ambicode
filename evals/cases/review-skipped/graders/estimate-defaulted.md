---
type: regex
pattern: '"kind":"default-taken","gate":"estimate"'
match: contains
target: { source: file, path: repo/.ambicode/reviews/rev-skip/ledger.jsonl }
weight: 1
---
