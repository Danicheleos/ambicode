---
type: regex
pattern: '"kind":"note","note":"investigation"'
match: contains
target: { source: file, path: repo/.ambicode/tasks/inv-optout/ledger.jsonl }
weight: 1
---
