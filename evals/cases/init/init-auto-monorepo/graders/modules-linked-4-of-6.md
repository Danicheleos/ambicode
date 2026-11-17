---
type: regex
pattern: '^(?=[\s\S]*\]\(modules/engine/crates/protocol/src\.md\))(?=[\s\S]*\]\(modules/engine/crates/safety/src\.md\))(?=[\s\S]*\]\(modules/engine/crates/schedule/src/overview\.md\))(?=[\s\S]*\]\(modules/engine/crates/schedule/src/ramp/overview\.md\))(?=[\s\S]*\]\(modules/engine/crates/schedule/src/ramp/profiles\.md\))(?=[\s\S]*\]\(modules/engine/crates/sim/src\.md\))'
match: contains
target: { source: file, path: .ambicode/context/index.md }
weight: 1
---
