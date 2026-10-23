---
type: regex
pattern: 'Number\.isInteger\([^)]*minutes'
match: contains
target: { source: file, path: repo/dashboard/src/lib/validate/segments.ts }
weight: 1
---
