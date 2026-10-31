---
type: regex
pattern: '(?<!## Policies[\s\S]*)(?:engine/crates/(controller|sim)/)'
match: contains
target: { source: file, path: .ambicode/tasks/plan-mono-calibrate/plan.md }
weight: 1
---
