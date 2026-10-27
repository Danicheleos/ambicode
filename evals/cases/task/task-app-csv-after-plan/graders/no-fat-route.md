---
type: regex
pattern: 'invoicesCsv[^\n]*(\.map\(|\.reduce\(|toDecimal|money\.)'
match: not_contains
target: { source: file, path: src/invoices/routes.js }
weight: 1
---
