---
type: regex
pattern: '"kind":"map"[^\n]*ramp/linear\.rs'
match: contains
target: { source: file, path: .ambicode/tasks/kl-zero/ledger.jsonl }
weight: 1
---
