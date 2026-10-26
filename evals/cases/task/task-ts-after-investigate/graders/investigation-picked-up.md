---
type: regex
pattern: '"kind":"map"[^\n]*on-loan-returned\.ts'
match: contains
target: { source: file, path: .ambicode/tasks/lb-waiver/ledger.jsonl }
weight: 1
---
