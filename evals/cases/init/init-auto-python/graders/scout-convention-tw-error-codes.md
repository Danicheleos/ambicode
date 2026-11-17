---
type: regex
pattern: '(TW-(\d{3}|nnn))'
match: contains
target: { source: file, path: .ambicode/context/conventions.md }
weight: 1
---
