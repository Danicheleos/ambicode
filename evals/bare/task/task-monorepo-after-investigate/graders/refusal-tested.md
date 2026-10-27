---
type: regex
pattern: 'minutes: 0'
match: contains
target: { source: file, path: engine/crates/schedule/tests/firing.rs }
weight: 1
---
