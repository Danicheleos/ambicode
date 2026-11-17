---
type: regex
pattern: '"worker":"plan-check"[^\n]*"summary":\{"failed":false'
match: contains
target: { source: file, path: .ambicode/tasks/rpl-1/ledger.jsonl }
weight: 1
---
