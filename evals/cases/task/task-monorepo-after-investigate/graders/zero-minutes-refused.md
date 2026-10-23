---
type: regex
pattern: 'minutes == 0|minutes < 1'
match: contains
target: { source: file, path: repo/engine/crates/schedule/src/plan.rs }
weight: 1
---
