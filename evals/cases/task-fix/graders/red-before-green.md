---
type: regex
pattern: '"exit":[1-9]\d*,"phase":"red"[\s\S]*"exit":0,"phase":"green"'
match: contains
target: { source: file, path: repo/.ambicode/tasks/fix-page/ledger.jsonl }
weight: 2
---
