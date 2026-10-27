---
type: regex
pattern: '"stage":"drafts"[^\n]*"errors":0'
match: contains
target: { source: file, path: .ambicode/tasks/rules-ds/ledger.jsonl }
weight: 1
---
