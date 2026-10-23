---
type: regex
pattern: '^(?=[\s\S]*\]\(modules/adapters/overview\.md\))(?=[\s\S]*\]\(modules/adapters/cli/overview\.md\))(?=[\s\S]*\]\(modules/adapters/cli/src/main/kotlin/org/seedvault/adapters/cli/overview\.md\))(?=[\s\S]*\]\(modules/adapters/cli/src/main/kotlin/org/seedvault/adapters/cli/commands\.md\))(?=[\s\S]*\]\(modules/adapters/cli/src/main/kotlin/org/seedvault/adapters/cli/render\.md\))(?=[\s\S]*\]\(modules/adapters/messaging/overview\.md\))'
match: contains
target: { source: file, path: .ambicode/context/index.md }
weight: 1
---
