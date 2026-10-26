---
type: regex
pattern: 'service\.revenueByCustomer\('
match: contains
target: { source: file, path: src/reports/routes.js }
weight: 1
---
