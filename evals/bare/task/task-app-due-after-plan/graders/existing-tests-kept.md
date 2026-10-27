---
type: regex
pattern: 'total is subtotal plus rounded tax'
match: contains
target: { source: file, path: tests/invoices/service.test.js }
weight: 1
---
