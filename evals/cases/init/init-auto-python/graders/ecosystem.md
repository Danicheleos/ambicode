---
type: regex
pattern: '(^|\n)[^#\n]*languages:[\s\S]{0,80}\b(python)\b'
match: contains
target: { source: file, path: .ambicode/config.yaml }
weight: 1
---
