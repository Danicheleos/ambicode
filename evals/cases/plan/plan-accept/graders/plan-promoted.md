---
type: regex
pattern: '"kind":"note","note":"plan"'
match: contains
target: { source: file, path: repo/.ambicode/tasks/plan-due/ledger.jsonl }
weight: 1
---
