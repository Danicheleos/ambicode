---
type: regex
pattern: '^(?=[\s\S]*\]\(modules/src/tidewatch/app/queries\.md\))(?=[\s\S]*\]\(modules/src/tidewatch/cli\.md\))(?=[\s\S]*\]\(modules/src/tidewatch/domain/overview\.md\))(?=[\s\S]*\]\(modules/src/tidewatch/domain/events\.md\))(?=[\s\S]*\]\(modules/src/tidewatch/domain/rules\.md\))(?=[\s\S]*\]\(modules/src/tidewatch/domain/units\.md\))'
match: contains
target: { source: file, path: .ambicode/context/index.md }
weight: 1
---
