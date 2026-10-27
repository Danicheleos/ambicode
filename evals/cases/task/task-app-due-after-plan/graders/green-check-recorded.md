---
type: regex
pattern: '"kind":"check"[^\n]*"exit":0,"phase":"green"'
match: contains
target: { source: file, path: .ambicode/tasks/ap-due/ledger.jsonl }
weight: 1
---
