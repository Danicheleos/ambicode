---
type: regex
pattern: '/invoices\.csv'
match: contains
target: { source: file, path: src/invoices/routes.js }
weight: 1
---
