---
type: regex
pattern: '"findings":[1-9]'
match: contains
target: { source: file, path: .ambicode/reviews/rev-2/ledger.jsonl }
weight: 2
---
