---
type: regex
pattern: '(^|\n)[^#\n]*(root|paths):[\s\S]{0,40}tools'
match: contains
target: { source: file, path: .ambicode/config.yaml }
weight: 1
---
