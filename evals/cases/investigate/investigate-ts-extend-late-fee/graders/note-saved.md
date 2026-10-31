---
type: regex
pattern: '"kind":"note","note":"investigation"'
match: contains
target: { source: file, path: .ambicode/tasks/inv-extend/ledger.jsonl }
weight: 1
---
