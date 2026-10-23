---
type: regex
pattern: '(test_\w*<?\w+>?__<?\w+|double[- ]underscore)'
match: contains
target: { source: file, path: .ambicode/context/conventions.md }
weight: 1
---
