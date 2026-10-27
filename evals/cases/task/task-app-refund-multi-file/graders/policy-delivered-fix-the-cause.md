---
type: regex
pattern: '(?:^|\n)(?=[^\n]*"kind":"policy")(?=[^\n]*"activity":"task")(?=[^\n]*"ids":\[[^\]]*"common-design/fix-the-cause")'
match: contains
target: { source: file, path: .ambicode/tasks/fix-refund/ledger.jsonl }
weight: 1
---
