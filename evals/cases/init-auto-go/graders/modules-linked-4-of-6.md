---
type: regex
pattern: '^(?=[\s\S]*\]\(modules/internal/labels\.md\))(?=[\s\S]*\]\(modules/internal/manifest\.md\))(?=[\s\S]*\]\(modules/internal/memstore\.md\))(?=[\s\S]*\]\(modules/internal/notify\.md\))(?=[\s\S]*\]\(modules/internal/pricing\.md\))(?=[\s\S]*\]\(modules/internal/rates\.md\))'
match: contains
target: { source: file, path: .ambicode/context/index.md }
weight: 1
---
