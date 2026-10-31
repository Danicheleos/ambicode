---
type: regex
pattern: '^(?=[\s\S]*\]\(modules/domain/src/main/kotlin/org/seedvault/domain/germination\.md\))(?=[\s\S]*\]\(modules/domain/src/main/kotlin/org/seedvault/domain/lot\.md\))(?=[\s\S]*\]\(modules/domain/src/main/kotlin/org/seedvault/domain/shared\.md\))(?=[\s\S]*\]\(modules/domain/src/main/kotlin/org/seedvault/domain/species\.md\))(?=[\s\S]*\]\(modules/domain/src/main/kotlin/org/seedvault/domain/storage\.md\))'
match: contains
target: { source: file, path: .ambicode/context/index.md }
weight: 1
---
