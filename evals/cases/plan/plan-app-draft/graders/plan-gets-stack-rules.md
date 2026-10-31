---
type: regex
pattern: '(?:^|\n)(?=[^\n]*"kind":"policy")(?=[^\n]*"activity":"plan")(?=[^\n]*"ids":\[[^\]]*"(?:express-errors|express-http|express-persistence)/)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-app-draft/ledger.jsonl }
weight: 1
---
