---
type: regex
pattern: 'STATUS\.VOID|''void'''
match: not_contains
target: { source: file, path: src/customers/statement.js }
weight: 2
---
