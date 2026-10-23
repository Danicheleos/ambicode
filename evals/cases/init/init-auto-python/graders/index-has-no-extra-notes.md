---
type: regex
pattern: '\]\(modules/[^)\s]+\.md\)'
match: count:30
target: { source: file, path: .ambicode/context/index.md }
weight: 1
---
