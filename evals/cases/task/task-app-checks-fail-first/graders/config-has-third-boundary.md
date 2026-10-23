---
type: regex
pattern: 'agingBucketsDays: \[30, 60, 90\]'
match: contains
target: { source: file, path: repo/src/config.js }
weight: 1
---
