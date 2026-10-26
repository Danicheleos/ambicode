---
type: regex
pattern: '"note":"plan"'
match: not_contains
target: { source: file, path: .ambicode/tasks/plan-app-draft/ledger.jsonl }
weight: 1
---
