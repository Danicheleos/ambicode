---
type: regex
pattern: '([Kk]eyword[- ]only|, \*, )'
match: contains
target: { source: file, path: .ambicode/context/conventions.md }
weight: 1
---
