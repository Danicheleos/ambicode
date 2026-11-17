---
type: regex
pattern: '(var _ core\.|\(\*\w+\)\(nil\)|compile-time)'
match: contains
target: { source: file, path: .ambicode/context/conventions.md }
weight: 1
---
