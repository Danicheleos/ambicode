---
type: regex
pattern: 'VOID[^\n]*\?\s*0'
match: not_contains
target: { source: file, path: src/reports/service.js }
weight: 2
---
