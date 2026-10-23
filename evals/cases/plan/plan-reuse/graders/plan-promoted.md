---
type: regex
pattern: '"kind":"note","note":"plan"'
match: contains
target: { source: file, path: repo/.ambicode/tasks/plan-overdue/ledger.jsonl }
weight: 1
---
