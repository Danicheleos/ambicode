---
type: regex
pattern: '(^|\n)[^#\n]*(all|file):[^\n]*(golangci-lint|go vet)'
match: contains
target: { source: file, path: .ambicode/config.yaml }
weight: 1
---
