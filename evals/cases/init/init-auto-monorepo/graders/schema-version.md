---
type: regex
pattern: 'schemaVersion:\s*5'
match: contains
target: { source: file, path: .ambicode/config.yaml }
weight: 1
---
