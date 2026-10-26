---
type: regex
pattern: '"kind":"note","note":"investigation"'
match: contains
target: { source: file, path: .ambicode/tasks/inv-setpt/ledger.jsonl }
weight: 1
---
