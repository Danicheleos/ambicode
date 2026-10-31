---
type: regex
pattern: '"worker":"plan-check"[^\n]*"summary":\{"failed":false'
match: contains
target: { source: file, path: .ambicode/tasks/plan-app-overdue/ledger.jsonl }
weight: 1
---
