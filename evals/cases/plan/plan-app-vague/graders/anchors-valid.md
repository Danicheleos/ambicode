---
type: regex
pattern: '"worker":"plan-check"[^\n]*"anchorsBad":0'
match: contains
target: { source: file, path: repo/.ambicode/tasks/plan-app-vague/ledger.jsonl }
weight: 1
---
