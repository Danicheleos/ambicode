---
type: regex
pattern: '"worker":"check-citations"[^\n]*"failed":false'
match: contains
target: { source: file, path: repo/.ambicode/tasks/inv-segment2/ledger.jsonl }
weight: 1
---
