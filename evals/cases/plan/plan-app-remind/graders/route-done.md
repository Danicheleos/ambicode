---
type: regex
pattern: '"kind":"exit"[^\n]*"reason":"done"'
match: contains
target: { source: file, path: repo/.ambicode/tasks/plan-app-remind/ledger.jsonl }
weight: 1
---
