---
type: regex
pattern: '(?:^|\n)(?=[^\n]*"kind":"policy")(?=[^\n]*"activity":"task")(?=[^\n]*"ids":\[[^\]]*"common-design/reuse-before-reimplementing")'
match: contains
target: { source: file, path: .ambicode/tasks/ap-csv/ledger.jsonl }
weight: 1
---
