---
type: regex
pattern: '(exclude|ignored):[\s\S]{0,300}__generated__'
match: contains
target: { source: file, path: .ambicode/config.yaml }
weight: 1
---
