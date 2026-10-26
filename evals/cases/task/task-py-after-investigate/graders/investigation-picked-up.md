---
type: regex
pattern: '"kind":"map"[^\n]*domain/models\.py'
match: contains
target: { source: file, path: .ambicode/tasks/tw-start/ledger.jsonl }
weight: 1
---
