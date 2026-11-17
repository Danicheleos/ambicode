---
type: regex
pattern: '^(?=[\s\S]*\]\(modules/src/shared-kernel/result\.md\))(?=[\s\S]*\]\(modules/src/shared-kernel/time\.md\))'
match: contains
target: { source: file, path: .ambicode/context/index.md }
weight: 1
---
