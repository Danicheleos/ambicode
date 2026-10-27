---
type: regex
pattern: 'Scans\[len\('
match: not_contains
target: { source: file, path: internal/tracking/service.go }
weight: 1
---
