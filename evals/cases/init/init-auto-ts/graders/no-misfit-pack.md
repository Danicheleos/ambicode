---
type: regex
pattern: 'builtin/(angular-|express-|python-quality)'
match: not_contains
target: { source: file, path: .ambicode/config.yaml }
weight: 1
---
