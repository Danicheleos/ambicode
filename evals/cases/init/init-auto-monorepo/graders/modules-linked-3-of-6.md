---
type: regex
pattern: '^(?=[\s\S]*\]\(modules/engine/overview\.md\))(?=[\s\S]*\]\(modules/engine/crates/overview\.md\))(?=[\s\S]*\]\(modules/engine/crates/cli/src\.md\))(?=[\s\S]*\]\(modules/engine/crates/controller/src/overview\.md\))(?=[\s\S]*\]\(modules/engine/crates/controller/src/drivers\.md\))(?=[\s\S]*\]\(modules/engine/crates/logbook/src\.md\))'
match: contains
target: { source: file, path: .ambicode/context/index.md }
weight: 1
---
