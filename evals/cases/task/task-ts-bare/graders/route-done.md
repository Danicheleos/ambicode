---
type: regex
pattern: '"kind":"exit"[^\n]*"reason":"done"'
match: contains
target: { source: file, path: .ambicode/tasks/lb-return-twice/ledger.jsonl }
weight: 1
---
