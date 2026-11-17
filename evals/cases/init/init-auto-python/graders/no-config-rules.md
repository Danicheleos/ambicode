---
type: regex
pattern: 'source:\s*(scout|manual|web)|(^|\n)rules:|\n\s+instruction:'
match: not_contains
target: { source: file, path: .ambicode/config.yaml }
weight: 1
---
