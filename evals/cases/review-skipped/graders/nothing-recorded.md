---
type: regex
pattern: '"stage":"recorded"'
match: not_contains
target: { source: file, path: repo/.ambicode/reviews/rev-skip/ledger.jsonl }
weight: 1
---
