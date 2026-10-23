---
type: regex
pattern: '^(?=[\s\S]*\]\(modules/bootstrap/overview\.md\))(?=[\s\S]*\]\(modules/bootstrap/src/main/kotlin/org/seedvault/bootstrap\.md\))(?=[\s\S]*\]\(modules/domain/overview\.md\))(?=[\s\S]*\]\(modules/domain/src/main/kotlin/org/seedvault/domain/overview\.md\))(?=[\s\S]*\]\(modules/domain/src/main/kotlin/org/seedvault/domain/donor\.md\))(?=[\s\S]*\]\(modules/domain/src/main/kotlin/org/seedvault/domain/events\.md\))'
match: contains
target: { source: file, path: .ambicode/context/index.md }
weight: 1
---
