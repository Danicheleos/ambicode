---
type: regex
pattern: '"stage":"drafts"[^\n]*"errors":0'
match: contains
target: { source: file, path: repo/.ambicode/tasks/rules-mig/ledger.jsonl }
weight: 1
---
