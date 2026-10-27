---
type: regex
pattern: '"worker":"plan-check"[^\n]*"summary":\{"failed":false'
match: contains
target: { source: file, path: .ambicode/tasks/plan-app-vague/ledger.jsonl }
weight: 1
---
