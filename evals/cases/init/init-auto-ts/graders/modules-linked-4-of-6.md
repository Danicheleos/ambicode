---
type: regex
pattern: '^(?=[\s\S]*\]\(modules/src/contexts/notifications/overview\.md\))(?=[\s\S]*\]\(modules/src/contexts/notifications/application\.md\))(?=[\s\S]*\]\(modules/src/contexts/notifications/channels\.md\))(?=[\s\S]*\]\(modules/src/platform/overview\.md\))(?=[\s\S]*\]\(modules/src/platform/config\.md\))(?=[\s\S]*\]\(modules/src/platform/db\.md\))'
match: contains
target: { source: file, path: .ambicode/context/index.md }
weight: 1
---
