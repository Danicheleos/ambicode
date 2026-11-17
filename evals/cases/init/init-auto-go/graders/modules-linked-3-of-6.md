---
type: regex
pattern: '^(?=[\s\S]*\]\(modules/internal/customs\.md\))(?=[\s\S]*\]\(modules/internal/depot\.md\))(?=[\s\S]*\]\(modules/internal/geo\.md\))(?=[\s\S]*\]\(modules/internal/httpapi/overview\.md\))(?=[\s\S]*\]\(modules/internal/httpapi/middleware\.md\))(?=[\s\S]*\]\(modules/internal/httpapi/render\.md\))'
match: contains
target: { source: file, path: .ambicode/context/index.md }
weight: 1
---
