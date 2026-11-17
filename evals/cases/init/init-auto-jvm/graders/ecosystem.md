---
type: regex
pattern: '(^|\n)[^#\n]*languages:[\s\S]{0,80}\b(kotlin|java)\b'
match: contains
target: { source: file, path: .ambicode/config.yaml }
weight: 1
---
