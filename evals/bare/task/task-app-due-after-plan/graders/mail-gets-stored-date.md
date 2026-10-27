---
type: regex
pattern: 'sendInvoiceCreated\([^;]*invoice\.dueDate'
match: contains
target: { source: file, path: src/invoices/service.js }
weight: 1
---
