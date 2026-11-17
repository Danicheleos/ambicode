---
type: regex
pattern: '^(?=[\s\S]*\]\(modules/adapters/rest/src/main/kotlin/org/seedvault/adapters/rest/routes\.md\))(?=[\s\S]*\]\(modules/adapters/rest/src/main/kotlin/org/seedvault/adapters/rest/server\.md\))(?=[\s\S]*\]\(modules/application/overview\.md\))(?=[\s\S]*\]\(modules/application/src/main/kotlin/org/seedvault/application/overview\.md\))(?=[\s\S]*\]\(modules/application/src/main/kotlin/org/seedvault/application/port/overview\.md\))(?=[\s\S]*\]\(modules/application/src/main/kotlin/org/seedvault/application/port/input\.md\))'
match: contains
target: { source: file, path: .ambicode/context/index.md }
weight: 1
---
