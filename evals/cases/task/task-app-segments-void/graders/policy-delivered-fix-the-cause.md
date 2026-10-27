---
type: regex
pattern: '(?:^|\n)(?=[^\n]*"kind":"policy")(?=[^\n]*"activity":"task")(?=[^\n]*"ids":\[[^\]]*"common-design/fix-the-cause")'
match: contains
target: { source: file, path: .ambicode/tasks/segments-void/ledger.jsonl }
weight: 1
---
