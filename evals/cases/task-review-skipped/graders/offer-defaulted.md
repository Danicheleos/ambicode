---
type: regex
pattern: '"kind":"default-taken","gate":"review-offer"'
match: contains
target: { source: file, path: repo/.ambicode/tasks/fix-page-noreview/ledger.jsonl }
weight: 1
---
