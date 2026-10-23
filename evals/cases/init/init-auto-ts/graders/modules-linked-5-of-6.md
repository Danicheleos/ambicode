---
type: regex
pattern: '^(?=[\s\S]*\]\(modules/src/platform/http\.md\))(?=[\s\S]*\]\(modules/src/platform/logging\.md\))(?=[\s\S]*\]\(modules/src/shared-kernel/overview\.md\))(?=[\s\S]*\]\(modules/src/shared-kernel/events\.md\))(?=[\s\S]*\]\(modules/src/shared-kernel/ids\.md\))(?=[\s\S]*\]\(modules/src/shared-kernel/money\.md\))'
match: contains
target: { source: file, path: .ambicode/context/index.md }
weight: 1
---
