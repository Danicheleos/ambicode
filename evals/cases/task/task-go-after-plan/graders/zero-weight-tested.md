---
type: regex
pattern: 'CentsFor\(0\)|\[\]int\{[^}]*\b0\b|\{\s*(?:\w+:\s*)?0\s*[,}]'
match: contains
target: { source: file, path: internal/rates/rates_test.go }
weight: 1
---
