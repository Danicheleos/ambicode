---
type: regex
pattern: '"worker":"plan-check"[^\n]*"anchorsBad":0'
match: contains
target: { source: file, path: .ambicode/tasks/plan-mono-degrees/ledger.jsonl }
weight: 1
---
