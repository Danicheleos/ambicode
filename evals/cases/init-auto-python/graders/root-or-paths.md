---
type: regex
pattern: '(^|\n)[^#\n]*paths:[\s\S]{0,40}(?<![\w/-])(src)(?![\w-])'
match: contains
target: { source: file, path: .ambicode/config.yaml }
weight: 1
---
