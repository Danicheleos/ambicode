---
type: regex
pattern: '^(?=[\s\S]*\]\(modules/src/overview\.md\))(?=[\s\S]*\]\(modules/src/contexts/overview\.md\))(?=[\s\S]*\]\(modules/src/contexts/billing/overview\.md\))(?=[\s\S]*\]\(modules/src/contexts/billing/application\.md\))(?=[\s\S]*\]\(modules/src/contexts/billing/domain\.md\))(?=[\s\S]*\]\(modules/src/contexts/catalog/overview\.md\))'
match: contains
target: { source: file, path: .ambicode/context/index.md }
weight: 1
---
