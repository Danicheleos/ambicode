---
type: regex
pattern: '\n\s*- id:[\s\S]*\n\s*- id:'
match: not_contains
target: { source: file, path: .ambicode/config.yaml }
weight: 1
---
