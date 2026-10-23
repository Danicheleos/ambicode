---
type: regex
pattern: '(_dc\b|\b\w+Dc\b|tenths of a degree)'
match: contains
target: { source: file, path: .ambicode/context/conventions.md }
weight: 1
---
