---
type: regex
pattern: '^(?=[\s\S]*\]\(modules/src/tidewatch/infra/overview\.md\))(?=[\s\S]*\]\(modules/src/tidewatch/infra/clock\.md\))(?=[\s\S]*\]\(modules/src/tidewatch/infra/config\.md\))(?=[\s\S]*\]\(modules/src/tidewatch/infra/store\.md\))(?=[\s\S]*\]\(modules/src/tidewatch/plugins/overview\.md\))(?=[\s\S]*\]\(modules/src/tidewatch/plugins/sources/overview\.md\))'
match: contains
target: { source: file, path: .ambicode/context/index.md }
weight: 1
---
