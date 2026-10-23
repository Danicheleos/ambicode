---
type: regex
pattern: 'function revenueByCustomer\(\)[\s\S]{0,300}groupBy\('
match: contains
target: { source: file, path: repo/src/reports/service.js }
weight: 1
---
