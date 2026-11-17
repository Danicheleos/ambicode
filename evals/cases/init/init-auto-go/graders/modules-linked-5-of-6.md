---
type: regex
pattern: '^(?=[\s\S]*\]\(modules/internal/retention\.md\))(?=[\s\S]*\]\(modules/internal/returns\.md\))(?=[\s\S]*\]\(modules/internal/routing\.md\))(?=[\s\S]*\]\(modules/internal/scanner\.md\))(?=[\s\S]*\]\(modules/internal/slots\.md\))(?=[\s\S]*\]\(modules/internal/tagging\.md\))'
match: contains
target: { source: file, path: .ambicode/context/index.md }
weight: 1
---
