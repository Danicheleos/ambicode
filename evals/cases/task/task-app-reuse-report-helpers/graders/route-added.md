---
type: regex
pattern: '/reports/revenue-by-customer'
match: contains
target: { source: file, path: repo/src/reports/routes.js }
weight: 1
---
