---
type: regex
pattern: '(?:^|\n)(?=[^\n]*"kind":"policy")(?=[^\n]*"stage":"required")(?=[^\n]*"ids":\[)'
match: contains
target: { source: file, path: .ambicode/tasks/rpl-1/ledger.jsonl }
weight: 2
---
