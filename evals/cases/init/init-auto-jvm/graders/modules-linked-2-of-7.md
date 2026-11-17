---
type: regex
pattern: '^(?=[\s\S]*\]\(modules/adapters/messaging/src/main/kotlin/org/seedvault/adapters/messaging/overview\.md\))(?=[\s\S]*\]\(modules/adapters/messaging/src/main/kotlin/org/seedvault/adapters/messaging/bus\.md\))(?=[\s\S]*\]\(modules/adapters/messaging/src/main/kotlin/org/seedvault/adapters/messaging/mail\.md\))(?=[\s\S]*\]\(modules/adapters/messaging/src/main/kotlin/org/seedvault/adapters/messaging/outbox\.md\))(?=[\s\S]*\]\(modules/adapters/persistence/overview\.md\))(?=[\s\S]*\]\(modules/adapters/persistence/src/main/kotlin/org/seedvault/adapters/persistence/overview\.md\))'
match: contains
target: { source: file, path: .ambicode/context/index.md }
weight: 1
---
