---
type: regex
pattern: 'invoices\.list\(\{ customerId \}\)[\s\S]*invoices\.list\(\{ customerId \}\)'
match: not_contains
target: { source: file, path: src/customers/segments.js }
weight: 2
---
