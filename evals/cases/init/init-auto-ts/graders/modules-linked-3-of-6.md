---
type: regex
pattern: '^(?=[\s\S]*\]\(modules/src/contexts/lending/domain/fees\.md\))(?=[\s\S]*\]\(modules/src/contexts/lending/http\.md\))(?=[\s\S]*\]\(modules/src/contexts/members/overview\.md\))(?=[\s\S]*\]\(modules/src/contexts/members/application\.md\))(?=[\s\S]*\]\(modules/src/contexts/members/domain\.md\))(?=[\s\S]*\]\(modules/src/contexts/members/http\.md\))'
match: contains
target: { source: file, path: .ambicode/context/index.md }
weight: 1
---
