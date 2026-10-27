---
type: regex
pattern: 'toFixed|/ 100'
match: not_contains
target: { source: file, path: src/reports/service.js }
weight: 1
---
