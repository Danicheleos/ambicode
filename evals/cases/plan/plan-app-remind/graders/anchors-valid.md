---
type: regex
pattern: '"worker":"plan-check"(?![^\n]*"uncoded")[^\n]*"anchorsBad":0'
match: contains
target: { source: file, path: repo/.ambicode/tasks/plan-app-remind/ledger.jsonl }
weight: 1
---
