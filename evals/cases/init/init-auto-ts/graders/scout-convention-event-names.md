---
type: regex
pattern: '([a-z]+\.[a-z]+(-[a-z]+)+|<context>\.<|past[- ]tense)'
match: contains
target: { source: file, path: .ambicode/context/conventions.md }
weight: 1
---
