---
type: regex
pattern: '(?:^|\n)(?=[^\n]*"kind":"policy")(?=[^\n]*"activity":"task")(?=[^\n]*"ids":\[[^\]]*"express-errors/classified-errors")'
match: contains
target: { source: file, path: .ambicode/tasks/ap-due/ledger.jsonl }
weight: 1
---
