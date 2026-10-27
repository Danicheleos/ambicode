---
type: regex
pattern: '"worker":"plan-check"[^\n]*"summary":\{"failed":false'
match: contains
target: { source: file, path: .ambicode/tasks/plan-app-remind/ledger.jsonl }
weight: 1
---
