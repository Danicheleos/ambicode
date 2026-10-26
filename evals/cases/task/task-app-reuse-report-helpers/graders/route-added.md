---
type: regex
pattern: '/reports/revenue-by-customer'
match: contains
target: { source: file, path: src/reports/routes.js }
weight: 1
---
