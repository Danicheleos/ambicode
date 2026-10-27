---
type: regex
pattern: 'throw new Error\('
match: not_contains
target: { source: file, path: src/invoices/service.js }
weight: 1
---
