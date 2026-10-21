---
type: regex
pattern: '^(?=[\s\S]*\]\(modules/dashboard/overview\.md\))(?=[\s\S]*\]\(modules/dashboard/src/overview\.md\))(?=[\s\S]*\]\(modules/dashboard/src/lib/overview\.md\))(?=[\s\S]*\]\(modules/dashboard/src/lib/engine\.md\))(?=[\s\S]*\]\(modules/dashboard/src/lib/format\.md\))(?=[\s\S]*\]\(modules/dashboard/src/lib/validate\.md\))'
match: contains
target: { source: file, path: .ambicode/context/index.md }
weight: 1
---
