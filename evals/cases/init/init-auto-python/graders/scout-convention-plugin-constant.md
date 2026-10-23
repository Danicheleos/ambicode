---
type: regex
pattern: '(SourcePlugin\(|\bPLUGIN\b)'
match: contains
target: { source: file, path: .ambicode/context/conventions.md }
weight: 1
---
