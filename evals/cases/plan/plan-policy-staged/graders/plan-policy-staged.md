---
type: regex
pattern: '(?:^|\n)(?=[^\n]*"kind":"policy")(?=[^\n]*"activity":"plan")(?=[^\n]*"ids":\[[^\]]*"common-design/scope")'
match: contains
target: { source: file, path: .ambicode/tasks/rpl-1/ledger.jsonl }
weight: 2
---
