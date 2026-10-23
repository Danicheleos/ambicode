---
type: regex
pattern: '^(?=[\s\S]*\]\(modules/src/tidewatch/overview\.md\))(?=[\s\S]*\]\(modules/src/tidewatch/api/overview\.md\))(?=[\s\S]*\]\(modules/src/tidewatch/api/handlers\.md\))(?=[\s\S]*\]\(modules/src/tidewatch/app/overview\.md\))(?=[\s\S]*\]\(modules/src/tidewatch/app/commands\.md\))(?=[\s\S]*\]\(modules/src/tidewatch/app/ports\.md\))'
match: contains
target: { source: file, path: .ambicode/context/index.md }
weight: 1
---
