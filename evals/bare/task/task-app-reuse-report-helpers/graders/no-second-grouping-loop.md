---
type: regex
pattern: 'new Map\([\s\S]*new Map\('
match: not_contains
target: { source: file, path: src/reports/service.js }
weight: 1
---
