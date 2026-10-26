---
type: regex
pattern: 'Errorf\("pricing\.Quote: %w", core\.ErrInvalid\)'
match: contains
target: { source: file, path: internal/pricing/price.go }
weight: 1
---
