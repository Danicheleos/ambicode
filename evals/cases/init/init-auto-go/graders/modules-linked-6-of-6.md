---
type: regex
pattern: '^(?=[\s\S]*\]\(modules/internal/tracking\.md\))'
match: contains
target: { source: file, path: .ambicode/context/index.md }
weight: 1
---
