---
type: regex
pattern: '"exit":[1-9][0-9]*,"phase":"green"(?![\s\S]*"exit":0,"phase":"green")'
match: not_contains
target: { source: file, path: .ambicode/tasks/refund-mail/ledger.jsonl }
weight: 1
---
