---
type: regex
pattern: '"findings":[1-9]'
match: contains
target: { source: file, path: repo/.ambicode/reviews/rev-page/ledger.jsonl }
weight: 2
---
