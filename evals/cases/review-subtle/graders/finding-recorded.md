---
type: regex
pattern: '"findings":[1-9]'
match: contains
target: { source: file, path: repo/.ambicode/reviews/rev-money/ledger.jsonl }
weight: 2
---
