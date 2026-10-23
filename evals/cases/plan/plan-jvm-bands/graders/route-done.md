---
type: regex
pattern: '"kind":"exit"[^\n]*"reason":"done"'
match: contains
target: { source: file, path: repo/.ambicode/tasks/plan-jvm-bands/ledger.jsonl }
weight: 1
---
