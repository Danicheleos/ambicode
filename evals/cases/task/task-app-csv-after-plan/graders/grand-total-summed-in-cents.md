---
type: regex
pattern: 'invoicesToCsv[\s\S]*money\.sum\('
match: contains
target: { source: file, path: src/reports/csv.js }
weight: 1
---
