---
type: regex
pattern: '"worker":"check-citations"[^\n]*"failed":false'
match: contains
target: { source: file, path: .ambicode/tasks/inv-optout2/ledger.jsonl }
weight: 1
---
