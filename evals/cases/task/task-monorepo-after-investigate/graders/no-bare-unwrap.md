---
type: regex
pattern: '\.unwrap\(\)'
match: not_contains
target: { source: file, path: engine/crates/schedule/src/plan.rs }
weight: 1
---
