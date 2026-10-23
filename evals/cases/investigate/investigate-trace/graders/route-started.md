---
type: regex
pattern: '"kind":"route","skill":"investigate"'
match: contains
target: { source: file, path: repo/.ambicode/tasks/pay-trace/ledger.jsonl }
weight: 1
---
