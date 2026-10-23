---
type: regex
pattern: 'time\.Now'
match: not_contains
target: { source: file, path: repo/internal/tracking/service.go }
weight: 1
---
