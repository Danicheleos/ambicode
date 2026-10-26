---
type: regex
pattern: 'module\.exports = \{[^}]*revenueByCustomer'
match: contains
target: { source: file, path: src/reports/service.js }
weight: 1
---
