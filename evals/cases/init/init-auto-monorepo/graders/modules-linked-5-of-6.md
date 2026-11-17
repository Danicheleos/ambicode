---
type: regex
pattern: '^(?=[\s\S]*\]\(modules/engine/crates/telemetry/src\.md\))(?=[\s\S]*\]\(modules/engine/crates/units/src\.md\))(?=[\s\S]*\]\(modules/tools/overview\.md\))(?=[\s\S]*\]\(modules/tools/src/kilnlab/overview\.md\))(?=[\s\S]*\]\(modules/tools/src/kilnlab/calibration\.md\))(?=[\s\S]*\]\(modules/tools/src/kilnlab/config\.md\))'
match: contains
target: { source: file, path: .ambicode/context/index.md }
weight: 1
---
