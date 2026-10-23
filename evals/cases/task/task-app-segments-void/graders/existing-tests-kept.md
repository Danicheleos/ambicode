---
type: regex
pattern: 'a customer with no invoices is standard[\s\S]*lifetime spend decides the segment[\s\S]*describe counts invoices'
match: contains
target: { source: file, path: repo/tests/customers/segments.test.js }
weight: 1
---
