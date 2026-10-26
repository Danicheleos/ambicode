---
type: regex
pattern: '"kind":"exit"[^\n]*"reason":"done"'
match: contains
target: { source: file, path: .ambicode/tasks/plan-ts-grace/ledger.jsonl }
weight: 1
---
