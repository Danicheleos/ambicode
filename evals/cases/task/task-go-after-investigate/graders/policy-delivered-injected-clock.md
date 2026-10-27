---
type: regex
pattern: '(?:^|\n)(?=[^\n]*"kind":"policy")(?=[^\n]*"activity":"task")(?=[^\n]*"ids":\[[^\]]*"parcelhub-team/injected-clock")'
match: contains
target: { source: file, path: .ambicode/tasks/ph-advance/ledger.jsonl }
weight: 1
---
