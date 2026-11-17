---
type: regex
pattern: '"step":"draft"[^\n]*"status":"delivered"|"status":"delivered"[^\n]*"step":"draft"'
match: contains
target: { source: file, path: .ambicode/tasks/rpl-1/ledger.jsonl }
weight: 1
---
