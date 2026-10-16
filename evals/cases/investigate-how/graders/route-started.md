---
type: regex
pattern: '"kind":"route","skill":"investigate"'
match: contains
target: { source: file, path: repo/.ambicode/tasks/inv-how/ledger.jsonl }
weight: 1
---
