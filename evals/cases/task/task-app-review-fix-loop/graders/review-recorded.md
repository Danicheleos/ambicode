---
type: regex
pattern: '"kind":"review"'
match: contains
target: { source: file, path: .ambicode/tasks/refund-mail/ledger.jsonl }
weight: 1
---
