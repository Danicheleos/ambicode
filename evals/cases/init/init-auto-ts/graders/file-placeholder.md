---
type: regex
pattern: '(^|\n)[^#\n]*file:[^\n]*(jest|eslint)[^\n]*\{file\}'
match: contains
target: { source: file, path: .ambicode/config.yaml }
weight: 1
---
