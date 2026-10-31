---
type: regex
pattern: 'builtin/(angular-)'
match: not_contains
target: { source: file, path: .ambicode/config.yaml }
weight: 1
---
