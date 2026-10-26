---
type: regex
pattern: '"kind":"check"[^\n]*"exit":0,"phase":"green"'
match: contains
target: { source: file, path: .ambicode/tasks/refund-mail/ledger.jsonl }
weight: 1
---
