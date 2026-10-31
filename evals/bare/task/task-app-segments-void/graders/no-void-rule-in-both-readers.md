---
type: regex
pattern: '(STATUS\.VOID|''void'')[\s\S]*(STATUS\.VOID|''void'')'
match: not_contains
target: { source: file, path: src/customers/segments.js }
weight: 2
---
