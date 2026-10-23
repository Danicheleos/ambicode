---
type: regex
pattern: 'revenue counts only paid invoices, per issue month'
match: contains
target: { source: file, path: repo/tests/reports/service.test.js }
weight: 1
---
