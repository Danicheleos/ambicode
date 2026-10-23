---
type: regex
pattern: '^(?=[\s\S]*\]\(modules/cmd/overview\.md\))(?=[\s\S]*\]\(modules/cmd/parcelctl\.md\))(?=[\s\S]*\]\(modules/cmd/parceld\.md\))(?=[\s\S]*\]\(modules/internal/overview\.md\))(?=[\s\S]*\]\(modules/internal/audit\.md\))(?=[\s\S]*\]\(modules/internal/carrier/overview\.md\))'
match: contains
target: { source: file, path: .ambicode/context/index.md }
weight: 1
---
