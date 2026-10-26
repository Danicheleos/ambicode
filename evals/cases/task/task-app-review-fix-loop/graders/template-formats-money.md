---
type: regex
pattern: '[Rr]efund\w*\([\s\S]{0,400}money\.format'
match: contains
target: { source: file, path: src/notifications/templates.js }
weight: 1
---
