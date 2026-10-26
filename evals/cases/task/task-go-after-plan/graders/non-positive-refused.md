---
type: regex
pattern: 'grams (<= 0|< 1)'
match: contains
target: { source: file, path: internal/rates/lookup.go }
weight: 1
---
