---
type: regex
pattern: 'policies/common/common-design\.yaml'
match: contains
target: { source: file, path: .ambicode/config.yaml }
weight: 1
---
