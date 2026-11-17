---
type: regex
pattern: '^(?=[\s\S]*\]\(modules/internal/carrier/regional/overview\.md\))(?=[\s\S]*\]\(modules/internal/carrier/regional/sortline/overview\.md\))(?=[\s\S]*\]\(modules/internal/carrier/regional/sortline/belt/overview\.md\))(?=[\s\S]*\]\(modules/internal/carrier/regional/sortline/belt/sensor\.md\))(?=[\s\S]*\]\(modules/internal/clock\.md\))(?=[\s\S]*\]\(modules/internal/core\.md\))'
match: contains
target: { source: file, path: .ambicode/context/index.md }
weight: 1
---
