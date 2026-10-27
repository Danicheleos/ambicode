---
type: regex
pattern: 'illable|STATUS\.VOID|''void'''
match: contains
target: { source: file, path: src/customers/statement.js }
weight: 1
---
