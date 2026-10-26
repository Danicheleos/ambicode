---
type: regex
pattern: 'daysBetween counts calendar days'
match: contains
target: { source: file, path: tests/reports/aging.test.js }
weight: 1
---
