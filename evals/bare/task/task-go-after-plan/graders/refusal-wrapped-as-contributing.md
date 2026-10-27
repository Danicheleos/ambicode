---
type: regex
pattern: 'grams (<= 0|< 1)[^\n]*\{\s*return 0, fmt\.Errorf\("rates\.CentsFor: %w", core\.ErrInvalid\)'
match: contains
target: { source: file, path: internal/rates/lookup.go }
weight: 1
---
