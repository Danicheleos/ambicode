---
type: regex
pattern: '"kind":"note","note":"investigation"'
match: contains
target: { source: file, path: repo/.ambicode/tasks/inv-mail/ledger.jsonl }
weight: 1
---
