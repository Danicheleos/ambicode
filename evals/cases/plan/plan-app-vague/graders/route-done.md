---
type: regex
pattern: '"kind":"exit"[^\n]*"reason":"done"'
match: contains
target: { source: file, path: .ambicode/tasks/plan-app-vague/ledger.jsonl }
weight: 1
---
