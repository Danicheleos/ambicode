---
type: regex
pattern: '"kind":"check"[^\n]*"exit":0,"phase":"green"'
match: contains
target: { source: file, path: repo/.ambicode/tasks/revenue-customer/ledger.jsonl }
weight: 1
---
