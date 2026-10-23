---
type: regex
pattern: '(^|\n)[^#\n]*file:[^\n]*(vitest|eslint)[^\n]*\{file\}'
match: contains
target: { source: file, path: .ambicode/config.yaml }
weight: 1
---
