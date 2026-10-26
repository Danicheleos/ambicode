---
type: regex
pattern: 'STATUS\.VOID|''void'''
match: contains
target: { source: file, path: src/customers/segments.js }
weight: 1
---
