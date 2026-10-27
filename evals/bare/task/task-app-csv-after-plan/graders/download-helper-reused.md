---
type: regex
pattern: 'attachment\([^)]*invoicesCsv'
match: contains
target: { source: file, path: src/invoices/routes.js }
weight: 1
---
