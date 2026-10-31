---
type: regex
pattern: '"worker":"check-citations"[^\n]*"failed":false'
match: contains
target: { source: file, path: .ambicode/tasks/inv-units/ledger.jsonl }
weight: 1
---
