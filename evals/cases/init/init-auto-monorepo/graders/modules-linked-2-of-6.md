---
type: regex
pattern: '^(?=[\s\S]*\]\(modules/dashboard/src/middleware\.md\))(?=[\s\S]*\]\(modules/dashboard/src/routes\.md\))(?=[\s\S]*\]\(modules/dashboard/src/services/overview\.md\))(?=[\s\S]*\]\(modules/dashboard/src/services/alerts\.md\))(?=[\s\S]*\]\(modules/dashboard/src/views/overview\.md\))(?=[\s\S]*\]\(modules/dashboard/src/views/components\.md\))'
match: contains
target: { source: file, path: .ambicode/context/index.md }
weight: 1
---
