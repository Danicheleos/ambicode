---
type: regex
pattern: 'source:\s*(scout|manual|web)'
match: not_contains
target: { source: file, path: .ambicode/config.yaml }
weight: 1
---
