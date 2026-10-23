---
type: regex
pattern: '"worker":"plan-check"[^\n]*"anchorsBad":0'
match: contains
target: { source: file, path: repo/.ambicode/tasks/plan-mono-calibrate/ledger.jsonl }
weight: 1
---
