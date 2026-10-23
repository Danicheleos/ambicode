---
type: regex
pattern: 'minutes: 0'
match: contains
target: { source: file, path: repo/engine/crates/schedule/tests/firing.rs }
weight: 1
---
