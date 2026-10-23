---
type: regex
pattern: 'service\.revenueByCustomer\('
match: contains
target: { source: file, path: repo/src/reports/routes.js }
weight: 1
---
