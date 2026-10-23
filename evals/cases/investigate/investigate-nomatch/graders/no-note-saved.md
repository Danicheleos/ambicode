---
type: regex
pattern: '"note":"investigation"'
match: not_contains
target: { source: file, path: repo/.ambicode/tasks/inv-none/ledger.jsonl }
weight: 1
---
