---
type: regex
pattern: 'return second \+ ''\+'''
match: not_contains
target: { source: file, path: repo/src/reports/aging.js }
weight: 1
---
