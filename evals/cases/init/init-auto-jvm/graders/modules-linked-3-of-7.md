---
type: regex
pattern: '^(?=[\s\S]*\]\(modules/adapters/persistence/src/main/kotlin/org/seedvault/adapters/persistence/cache\.md\))(?=[\s\S]*\]\(modules/adapters/persistence/src/main/kotlin/org/seedvault/adapters/persistence/file\.md\))(?=[\s\S]*\]\(modules/adapters/persistence/src/main/kotlin/org/seedvault/adapters/persistence/memory\.md\))(?=[\s\S]*\]\(modules/adapters/rest/overview\.md\))(?=[\s\S]*\]\(modules/adapters/rest/src/main/kotlin/org/seedvault/adapters/rest/overview\.md\))(?=[\s\S]*\]\(modules/adapters/rest/src/main/kotlin/org/seedvault/adapters/rest/dto\.md\))'
match: contains
target: { source: file, path: .ambicode/context/index.md }
weight: 1
---
