---
type: regex
pattern: '"kind":"map"[^\n]*tracking/history\.go'
match: contains
target: { source: file, path: repo/.ambicode/tasks/ph-advance/ledger.jsonl }
weight: 1
---
