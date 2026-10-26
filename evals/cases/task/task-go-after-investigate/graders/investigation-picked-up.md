---
type: regex
pattern: '"kind":"map"[^\n]*tracking/history\.go'
match: contains
target: { source: file, path: .ambicode/tasks/ph-advance/ledger.jsonl }
weight: 1
---
