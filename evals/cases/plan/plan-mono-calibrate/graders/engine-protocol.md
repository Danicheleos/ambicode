---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:engine/crates/protocol/)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-mono-calibrate/plan.md }
weight: 1
---
