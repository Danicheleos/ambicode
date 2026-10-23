---
type: regex
pattern: 'daysBetween counts calendar days'
match: contains
target: { source: file, path: repo/tests/reports/aging.test.js }
weight: 1
---
