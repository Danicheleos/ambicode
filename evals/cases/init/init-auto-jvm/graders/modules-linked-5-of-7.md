---
type: regex
pattern: '^(?=[\s\S]*\]\(modules/application/src/main/kotlin/org/seedvault/application/port/output\.md\))(?=[\s\S]*\]\(modules/application/src/main/kotlin/org/seedvault/application/usecase/overview\.md\))(?=[\s\S]*\]\(modules/application/src/main/kotlin/org/seedvault/application/usecase/donor\.md\))(?=[\s\S]*\]\(modules/application/src/main/kotlin/org/seedvault/application/usecase/germination\.md\))(?=[\s\S]*\]\(modules/application/src/main/kotlin/org/seedvault/application/usecase/lot\.md\))(?=[\s\S]*\]\(modules/application/src/main/kotlin/org/seedvault/application/usecase/report\.md\))'
match: contains
target: { source: file, path: .ambicode/context/index.md }
weight: 1
---
