---
type: regex
pattern: '"planPath":".ambicode/tasks/ap-csv/plan\.md","iteration":1'
match: contains
target: { source: file, path: .ambicode/tasks/ap-csv/ledger.jsonl }
weight: 1
---
