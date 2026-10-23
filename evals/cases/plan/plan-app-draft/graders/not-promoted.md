---
type: regex
pattern: '"note":"plan"'
match: not_contains
target: { source: file, path: repo/.ambicode/tasks/plan-app-draft/ledger.jsonl }
weight: 1
---
