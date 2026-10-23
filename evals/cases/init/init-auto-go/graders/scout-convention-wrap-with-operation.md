---
type: regex
pattern: '([a-z]+\.[A-Z][A-Za-z]*: %w)'
match: contains
target: { source: file, path: .ambicode/context/conventions.md }
weight: 1
---
