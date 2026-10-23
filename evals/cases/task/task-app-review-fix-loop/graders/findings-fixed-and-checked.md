---
type: regex
pattern: '^(?![\s\S]*"reason":"review-findings")|"reason":"review-findings"[\s\S]*"exit":0,"phase":"green"'
match: contains
target: { source: file, path: repo/.ambicode/tasks/refund-mail/ledger.jsonl }
weight: 1
---
