---
type: regex
pattern: '(^|\n)[^#\n]*file:[^\n]*(pytest|ruff)[^\n]*\{file\}'
match: contains
target: { source: file, path: .ambicode/config.yaml }
weight: 1
---
