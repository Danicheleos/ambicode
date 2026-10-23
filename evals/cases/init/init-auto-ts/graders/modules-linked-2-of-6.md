---
type: regex
pattern: '^(?=[\s\S]*\]\(modules/src/contexts/catalog/application\.md\))(?=[\s\S]*\]\(modules/src/contexts/catalog/domain\.md\))(?=[\s\S]*\]\(modules/src/contexts/catalog/http\.md\))(?=[\s\S]*\]\(modules/src/contexts/lending/overview\.md\))(?=[\s\S]*\]\(modules/src/contexts/lending/application\.md\))(?=[\s\S]*\]\(modules/src/contexts/lending/domain/overview\.md\))'
match: contains
target: { source: file, path: .ambicode/context/index.md }
weight: 1
---
