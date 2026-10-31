---
type: regex
pattern: '"worker":"check-citations"[^\n]*"failed":false'
match: contains
target: { source: file, path: .ambicode/tasks/inv-total/ledger.jsonl }
weight: 1
---
