---
type: regex
pattern: 'paths:\s*\[\s*src'
match: contains
target: { source: file, path: .ambicode/config.yaml }
weight: 1
---
